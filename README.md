# Visual Agent Engine

Server-Driven UI: агент → JSON Manifest → AJV Gatekeeper → Transactional Outbox → WebSocket → React Visual Engine.

## Документация

- [Техническая спецификация](docs/TECHNICAL_SPEC.md)
- [Декомпозиция](docs/DECOMPOSITION.md)
- [Пирамида тестирования](docs/TESTING_PYRAMID.md)
- [Roadmap 1–13](docs/ROADMAP_1_13.md)
- [Цели](docs/goals/)

## Быстрый старт (локально, in-memory)

```bash
npm install
npm test
npm run test:e2e -w frontend   # Playwright

# терминал 1
npm run dev:backend

# терминал 2
npm run dev:frontend
# http://localhost:5173/?sessionId=demo
```

Отправить манифест:

```bash
curl -s http://127.0.0.1:3001/api/manifest -H 'content-type: application/json' -d '{
  "sessionId":"demo","version":1,
  "manifest":{
    "taskId":"t1","operation":"SYNC_DASHBOARD",
    "layout":{"widgets":[{
      "widgetId":"w_01","type":"MetricCard",
      "size":{"w":4,"h":2},
      "props":{"title":"Users","value":42}
    }]}
  }
}'
```

CLI Self-Healing агент:

```bash
npm run agent -- submit --session demo --version 2 --file backend/tests/fixtures/manifest.invalid.json
```

## Docker (Postgres)

```bash
API_KEYS=dev-key docker compose up --build
# UI: http://localhost:8080/?sessionId=demo&apiKey=dev-key
# API: http://localhost:3001
```

## Агент (Cursor Skill)

В репозитории: `.cursor/skills/visual-agent-engine/`.

Агент сам подхватит skill при запросах про дашборд / виджеты / SDUI. Явно: «используй skill visual-agent-engine».

Лично для всех проектов можно скопировать папку в `~/.cursor/skills/visual-agent-engine/`.

## Пакеты

| Пакет | Назначение |
|-------|------------|
| `@visual-engine/shared` | Schema, props schemas, AJV, applyLayoutOperation |
| `@visual-engine/cli` | CLI submit + Self-Healing |
| `backend` | API, Outbox, WS, Postgres/memory, auth |
| `frontend` | VisualEngine + live session hook |
