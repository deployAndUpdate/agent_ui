# Техническая спецификация: Visual Agent Engine

## 1. Общие сведения и назначение

Система **Visual Agent Engine** предназначена для автономного создания, рендеринга и управления пользовательскими интерфейсами (дашбордами, формами, виджетами) со стороны ИИ-агента (работающего через CLI/скиллы).

Пайплайн исключает генерацию «сырого» HTML/JS, используя подход **Server-Driven UI (SDUI)** с жёстким детерминированным набором компонентов (**Component Registry**) и петлёй самоисправления (**Self-Healing Loop**).

## 2. Архитектура пайплайна (End-to-End Flow)

```
[CLI Agent] ---> (JSON Manifest) ---> [Validator Service (AJV)]
                                           │
                         ┌─────────────────┴─────────────────┐
                     [Invalid]                           [Valid]
                         │                                   │
                  (Return 400 Error)               [Transactional Outbox]
                         │                                   │
                  [Agent Retry]                      [WebSocket Stream]
                                                             │
                                                  [Frontend Visual Engine]
                                                             │
                                                   (Framer Motion Layout)
```

| Этап | Описание |
|------|----------|
| **Генерация** | Агент обрабатывает запрос, собирает данные и формирует JSON-манифест по схеме |
| **Валидация (Gatekeeper)** | Бэкенд проверяет манифест через AJV (JSON Schema). При ошибке — HTTP 400; агент корректирует структуру (Self-Healing) |
| **Доставка** | Событие пишется в `outbox_events`; консюмер пушит манифест клиенту по WebSocket |
| **Рендеринг** | Фронтенд сопоставляет типы с реестром и перестраивает UI (Framer Motion) |

## 3. Контракт данных (JSON Schema DTO)

Строгий контракт, который обязан возвращать агент. Канонический файл схемы: `packages/shared/schemas/dashboard-manifest.schema.json`.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "DashboardManifest",
  "type": "object",
  "properties": {
    "taskId": {
      "type": "string",
      "description": "Уникальный идентификатор сессии задачи"
    },
    "operation": {
      "type": "string",
      "enum": ["SYNC_DASHBOARD", "ADD_WIDGET", "UPDATE_WIDGET", "REMOVE_WIDGET"],
      "description": "Тип операции с бордой"
    },
    "layout": {
      "type": "object",
      "properties": {
        "widgets": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "widgetId": { "type": "string" },
              "type": {
                "type": "string",
                "enum": ["MetricCard", "DataChart", "ActionLog", "DataTable"]
              },
              "size": {
                "type": "object",
                "properties": {
                  "w": { "type": "integer", "minimum": 1, "maximum": 12 },
                  "h": { "type": "integer", "minimum": 1, "maximum": 6 }
                },
                "required": ["w", "h"]
              },
              "props": {
                "type": "object",
                "description": "Специфичные данные для конкретного компонента"
              }
            },
            "required": ["widgetId", "type", "size", "props"]
          }
        }
      },
      "required": ["widgets"]
    }
  },
  "required": ["taskId", "operation", "layout"]
}
```

### Событие взаимодействия виджета (client → backend)

```json
{
  "type": "widget_interaction",
  "taskId": "req_88231",
  "widgetId": "w_01",
  "action": "export_csv",
  "payload": { "format": "csv" },
  "timestamp": "2026-06-06T12:00:00Z"
}
```

## 4. Фронтенд-движок (Visual Engine)

- **Контейнер**: React, маппинг манифеста → 12-колоночная сетка (Tailwind CSS).
- **Реестр**: `MetricCard`, `DataChart`, `ActionLog`, `DataTable`.
- **Анимации**: Framer Motion (`layout`) для снижения CLS при resize/remove.
- **Обратная связь**: клики/формы/экспорт → стандартизированное событие на бэкенд.

## 5. Инфраструктура и состояние

| Паттерн | Требование |
|---------|------------|
| **Transactional Outbox** | Манифест и бизнес-транзакция пишутся в БД (PostgreSQL / in-memory store в тестах) атомарно в `outbox_events` |
| **Persisted Dashboards** | Таблица `dashboards`: последний успешный JSON-снимок по `session_id`. `GET /api/dashboard/{session_id}` |
| **Optimistic Locking** | Консюмер сверяет инкрементальный `version` / `timestamp`, чтобы устаревший ответ агента не перезаписал свежий |

### HTTP API (минимальный контракт)

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/manifest` | Приём манифеста от агента; валидация AJV; 400 / outbox |
| `GET` | `/api/dashboard/:sessionId` | Актуальный снимок борды |
| `POST` | `/api/widget-interaction` | События от виджетов |
| `WS` | `/ws?sessionId=` | Realtime-поток обновлений манифеста |

## 6. Self-Healing Loop

1. Агент отправляет манифест.
2. Gatekeeper возвращает 400 + AJV-ошибки.
3. Агент (или mock-слой в тестах) корректирует JSON и повторяет запрос.
4. Успех → outbox → WebSocket → UI.
