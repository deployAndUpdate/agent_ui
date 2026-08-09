# Декомпозиция Visual Agent Engine

Работаем по циклу: **цель модуля → тесты → код → прогон → фикс кода (тесты не трогаем)**.

| # | Модуль | Цель-файл | Слой пирамиды | Статус |
|---|--------|-----------|---------------|--------|
| 0 | Пирамида тестирования | [goals/00-testing-pyramid.md](./goals/00-testing-pyramid.md) | — | ✅ |
| 1 | Schema + AJV Validator | [goals/01-schema-validator.md](./goals/01-schema-validator.md) | Unit | ✅ |
| 2 | Outbox + Optimistic Lock | [goals/02-outbox-locking.md](./goals/02-outbox-locking.md) | Unit | ✅ |
| 3 | API + Mock AI + Self-Healing | [goals/03-api-self-healing.md](./goals/03-api-self-healing.md) | Integration | ✅ |
| 4 | WebSocket Stream | [goals/04-websocket.md](./goals/04-websocket.md) | Integration | ✅ |
| 5 | Frontend Visual Engine | [goals/05-frontend-engine.md](./goals/05-frontend-engine.md) | Unit / Component | ✅ |
| 6 | E2E Pipeline | [goals/06-e2e-pipeline.md](./goals/06-e2e-pipeline.md) | E2E | ✅ |

## Структура репозитория

```
visual_engine/
├── docs/                  # спека, декомпозиция, цели
├── packages/
│   └── shared/            # JSON Schema, общие типы
├── backend/               # Gatekeeper, Outbox, API, WS
└── frontend/              # Visual Engine (React + Framer Motion)
```
