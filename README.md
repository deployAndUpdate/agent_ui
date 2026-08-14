# Visual Agent Engine

Server-Driven UI: агент → JSON Manifest → AJV Gatekeeper → Transactional Outbox → WebSocket → клиенты (React web | TUI stub).

Два **параллельных** трека: веб (`/api/manifest`, `/ws`) и TUI (`/api/v1/tui/*`, `/api/v1/tui/stream`). Общей бизнес-логики между ними нет — веб можно выпилить без правок TUI-ядра.

## Документация

- [Техническая спецификация](docs/TECHNICAL_SPEC.md)
- [Декомпозиция](docs/DECOMPOSITION.md)
- [Пирамида тестирования](docs/TESTING_PYRAMID.md)
- [Roadmap 1–13](docs/ROADMAP_1_13.md)
- [Цели](docs/goals/)
- [TUI / Ratatui track](docs/goals/07-tui-ratatui.md)

## Быстрый старт (локально, in-memory)

```bash
npm install
npm test

./app-run front      # backend + web UI  → http://localhost:5173/?sessionId=demo
./app-run stop
```

Или по отдельности:

```bash
# терминал 1
npm run dev:backend

# терминал 2 — веб
npm run dev:frontend
# http://localhost:5173/?sessionId=demo

# терминал 2 — TUI (Ratatui)
npm run dev:tui
# TUI_WS_URL=ws://127.0.0.1:3001/api/v1/tui/stream?sessionId=demo
```

### Веб-манифест

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

### TUI-манифест

```bash
curl -s http://127.0.0.1:3001/api/v1/tui/manifest -H 'content-type: application/json' -d '{
  "sessionId":"demo",
  "manifest":{
    "taskId":"task_7749","operation":"SYNC_DASHBOARD",
    "layout":{"direction":"vertical","chunks":[{
      "widgetId":"w_header","type":"Paragraph","size":3,
      "props":{"title":"Hello","text":"TUI track","style":"cyan"}
    }]}
  }
}'
```

CLI Self-Healing агент (веб-трек):

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

## Пакеты

| Пакет | Назначение |
|-------|------------|
| `@visual-engine/shared` | Web schema, Scene Graph, RendererPort, AJV |
| `@visual-engine/tui-shared` | TUI schema (Paragraph/Table/…), AJV |
| `@visual-engine/cli` | CLI submit + Self-Healing (веб) |
| `backend` | Web + TUI API, Outbox, WS, Postgres/memory |
| `frontend` | React adapter (Scene → DOM) |
| `tui/` | Ratatui TUI browser (Paragraph/Table/List/Gauge/Chart) |
