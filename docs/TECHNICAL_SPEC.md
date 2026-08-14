# Техническая спецификация: Visual Agent Engine

## 1. Общие сведения и назначение

Система **Visual Agent Engine** предназначена для автономного создания, рендеринга и управления пользовательскими интерфейсами со стороны ИИ-агента (CLI/скиллы).

Пайплайн исключает генерацию «сырого» HTML/JS, используя подход **Server-Driven UI (SDUI)** с жёстким детерминированным набором компонентов (**Component Registry**) и петлёй самоисправления (**Self-Healing Loop**).

Поддерживаются **два параллельных трека** клиентов:

| Трек | Манифест | Транспорт | Клиент |
|------|----------|-----------|--------|
| **Web** | `DashboardManifest` (MetricCard, …) | `POST /api/manifest`, `WS /ws` | React (`frontend/`) |
| **TUI** | `TuiManifest` (Paragraph, Table, …) | `POST /api/v1/tui/manifest`, `WS /api/v1/tui/stream` | Rust stub → Ratatui (`tui/`) |

Треки не разделяют схемы, store и outbox. Веб можно удалить без правок TUI-ядра (см. [goals/07-tui-ratatui.md](./goals/07-tui-ratatui.md)).

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
                                      ┌──────────────────────┴──────────────────────┐
                                      ▼                                             ▼
                               [React / Scene Graph]                      [TUI RENDER_MANIFEST]
                                      │                                             │
                               [frontend]                                    [tui/ stub → Ratatui]
```

| Этап | Описание |
|------|----------|
| **Генерация** | Агент собирает данные и формирует JSON-манифест по схеме выбранного трека |
| **Валидация (Gatekeeper)** | Бэкенд проверяет манифест через AJV. При ошибке — HTTP 400; агент корректирует структуру |
| **Доставка** | Событие пишется в outbox трека; консюмер пушит клиенту по WebSocket |
| **Рендеринг** | Web: `manifestToScene` → React. TUI: chunks → terminal widgets (Ratatui) |

## 3. Контракт данных — Web (JSON Schema DTO)

Строгий контракт веб-трека. Канонический файл: `packages/shared/schemas/dashboard-manifest.schema.json`.

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

### Событие взаимодействия виджета (web client → backend)

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

## 3b. Контракт данных — TUI (параллельный)

Каноническая схема: `packages/tui-shared/schemas/tui-manifest.schema.json`.

Допустимые типы: `Paragraph`, `Table`, `List`, `Gauge`, `Chart`. Layout — `direction` + `chunks[]` с числовым `size` (вес/высота чанка).

```json
{
  "taskId": "task_7749",
  "operation": "SYNC_DASHBOARD",
  "layout": {
    "direction": "vertical",
    "chunks": [
      {
        "widgetId": "w_header",
        "type": "Paragraph",
        "size": 3,
        "props": {
          "title": "Agent Execution Panel",
          "text": "Status: Searching local files...",
          "style": "cyan"
        }
      },
      {
        "widgetId": "w_results",
        "type": "Table",
        "size": 12,
        "props": {
          "headers": ["File", "Lines", "Match Score"],
          "rows": [
            ["src/main.rs", "142", "0.98"],
            ["src/engine.rs", "85", "0.91"]
          ]
        }
      }
    ]
  }
}
```

### WebSocket события TUI

Backend → client:

```json
{ "event": "RENDER_MANIFEST", "payload": { /* TuiManifest */ } }
```

Client → backend:

```json
{
  "event": "USER_ACTION",
  "taskId": "task_7749",
  "widgetId": "w_results",
  "action": "select_row",
  "payload": { "rowIndex": 0, "rowData": ["src/main.rs", "142", "0.98"] }
}
```

## 4. Presentation layer (Web Scene Graph)

- **Scene**: `packages/shared` — `manifestToScene(manifest)` → `DashboardScene` (nodes, 12-col grid, traits).
- **RendererPort**: контракт веб-адаптера (`react`).
- **React adapter**: `frontend` — Scene → DOM.
- **Реестр типов (web)**: `MetricCard`, `DataChart`, `ActionLog`, `DataTable`.
- **TUI**: отдельный реестр в `@visual-engine/tui-shared`; stub в `tui/` печатает манифест (полный Ratatui — позже).

## 5. Инфраструктура и состояние

| Паттерн | Web | TUI |
|---------|-----|-----|
| **Transactional Outbox** | `outbox_events` | `tui_outbox` (`pending` → `sent`) |
| **Persisted State** | `dashboards` | `tui_sessions.last_manifest` |
| **Optimistic Locking** | `version` на submit | last-write-wins (без version) |
| **Interactions** | `POST /api/widget-interaction` | WS `USER_ACTION` / `POST /api/v1/tui/action` |

### HTTP / WS (минимальный контракт)

| Метод | Путь | Трек | Описание |
|-------|------|------|----------|
| `POST` | `/api/manifest` | Web | Приём манифеста; AJV; 400 / outbox |
| `GET` | `/api/dashboard/:sessionId` | Web | Актуальный снимок борды |
| `POST` | `/api/widget-interaction` | Web | События от виджетов |
| `WS` | `/ws?sessionId=` | Web | Realtime `dashboard_update` |
| `POST` | `/api/v1/tui/manifest` | TUI | Приём TUI-манифеста; AJV; 400 / outbox |
| `GET` | `/api/v1/tui/session/:sessionId` | TUI | Последний снимок |
| `POST` | `/api/v1/tui/action` | TUI | HTTP-fallback `USER_ACTION` |
| `WS` | `/api/v1/tui/stream?sessionId=` | TUI | `RENDER_MANIFEST` / `USER_ACTION` |

Порт по умолчанию: `3001` (`PORT` env).

## 6. Self-Healing Loop

1. Агент отправляет манифест выбранного трека.
2. Gatekeeper возвращает 400 + AJV-ошибки.
3. Агент корректирует JSON и повторяет запрос.
4. Успех → outbox трека → WebSocket → UI.
