---
name: visual-agent-engine
description: >-
  Builds and publishes Server-Driven UI dashboards via Visual Agent Engine TUI
  (TuiManifest → AJV → /api/v1/tui/manifest → Ratatui). Use when the user asks to
  create/update a dashboard, widgets, Paragraph, Table, List, Gauge, Chart,
  SDUI, visual-engine, TUI, USER_ACTION, select_row, navigate_back, or to push a
  manifest via visual-agent / vae-agent CLI.
---

# Visual Agent Engine (TUI only)

Never generate HTML/JS/React. Emit a **TuiManifest** JSON and submit it to the TUI API/CLI. Client: Ratatui (`./vae` or `npm run dev:tui`).

## Prerequisites

From repo root `visual_engine`:

1. `./install` (once) — Node, npm ci, release `vae-tui`
2. Backend + agent daemon + TUI: `./vae` or `./vae --demo` (`GET http://127.0.0.1:9090/health`)`
3. Auth (optional): `X-API-Key` / `VISUAL_ENGINE_API_KEY` when `AUTH_ENABLED=true`

## Workflow (always)

```
Task:
- [ ] 1. Choose sessionId
- [ ] 2. Write schema-valid TuiManifest JSON
- [ ] 3. Submit via CLI (self-healing) or curl
- [ ] 4. On 400: fix errors[], resubmit
- [ ] 5. Tell user how to view (same sessionId)
```

### 1. Session

- Default `sessionId`: `demo` (or user-provided)
- Last-write-wins (no web `version` lock)
- Check: `curl -s "http://127.0.0.1:3001/api/v1/tui/session/<SESSION>"` — 404 = empty

### 2. Write the manifest

Save e.g. `./.vae/manifest.tui.json`.

**Hard rules:**

- `operation`: `SYNC_DASHBOARD` | `ADD_WIDGET` | `UPDATE_WIDGET` | `REMOVE_WIDGET`
- Chunk `type`: only `Paragraph` | `Table` | `List` | `Gauge` | `Chart`
- Chunk `size`: positive integer (height hint) — **not** `{w,h}`
- Required per chunk: `widgetId`, `type`, `size`, `props`
- `layout.direction`: `vertical` | `horizontal`
- Prefer `SYNC_DASHBOARD` for a full board
- **Dumb templates** — all text/numbers live in `props`
- Props detail: [reference.md](reference.md)

```json
{
  "taskId": "req_<short_id>",
  "operation": "SYNC_DASHBOARD",
  "layout": {
    "direction": "vertical",
    "chunks": [
      {
        "widgetId": "w_header",
        "type": "Paragraph",
        "size": 3,
        "props": { "title": "Hello", "text": "TUI board", "style": "cyan" }
      }
    ]
  }
}
```

More boards: [examples.md](examples.md).

### 3. Submit (preferred CLI)

```bash
npm run agent -- submit \
  --session <SESSION> \
  --file <PATH_TO_TUI_MANIFEST.json>
```

Self-healing on HTTP 400 (up to 3). Prefer a valid manifest first.

```bash
curl -s http://127.0.0.1:3001/api/v1/tui/manifest \
  -H 'content-type: application/json' \
  -H "Idempotency-Key: <unique>" \
  -H "X-API-Key: $VISUAL_ENGINE_API_KEY" \
  -d "{\"sessionId\":\"<SESSION>\",\"manifest\":$(cat <TUI.json>)}"
```

- `200` → outbox → WS → Ratatui redraw
- `400` → fix `errors[]`
- `401` → API key

### 4. User-facing result

Always return:

- How to view: `TUI_SESSION_ID=<SESSION> npm run dev:tui` (or `./vae`)
- `sessionId`, `taskId`, operation
- Brief list of chunks (`widgetId` + `type`)

## Interaction (USER_ACTION)

Client or HTTP `POST /api/v1/tui/action`:

```json
{
  "event": "USER_ACTION",
  "taskId": "req_...",
  "widgetId": "w_table",
  "action": "select_row",
  "payload": { "rowIndex": 0, "row": ["..."] }
}
```

| action | Effect (builtin reactor) |
|--------|---------------------------|
| `select_row` | Push ephemeral detail board (`taskId` `detail_<widgetId>_<row>`); TUI auto-sends `/details` |
| `navigate_back` | Re-publish session board |
| `command` `/details` | POST agent webhook (`systemPrompt`: `more details`); agent SYNC enriched detail |
| `command` `/prompt` | POST webhook with user prompt + focused widget; daemon merges chunks. `payload.scope=detail` (ephemeral `detail_*`) or `board` (persists session board) |

`TUI_ACTION_REACTOR=builtin` (default) for select_row/navigate_back. Set `off` to only record those. `/details` and `/prompt` always use `TUI_AGENT_WEBHOOK_URL` when set.

For custom detail screens: listen for `select_row`, then `SYNC_DASHBOARD` with your own chunks; handle `navigate_back` the same way or leave builtin on.

TUI keys (Idle/`p` on board, browse → table → Enter → auto `/details` → `i` + arrows on detail → `p`): [reference.md](reference.md#tui-navigation).

## Do / Don't

| Do | Don't |
|----|-------|
| TUI types only | MetricCard / DataChart / React / HTML |
| `layout.chunks` + integer `size` | `layout.widgets` + `{w,h}` |
| CLI or `/api/v1/tui/manifest` | Claim UI updated without HTTP 200 |

## Repo map

- Schema: `packages/tui-shared/schemas/tui-manifest.schema.json`
- CLI: `packages/cli` (`npm run agent -- submit ...`)
- Client: `tui/` (Ratatui)
- Reactor: `backend/src/tui/actions/reactToUserAction.ts`
- Webhook: `backend/src/tui/actions/agentWebhook.ts`
- Daemon: `packages/tui-agent-bridge` — `./vae` starts it; `/details` and `/prompt` use a warm SDK agent when `CURSOR_API_KEY` is set
- Spec: `docs/TECHNICAL_SPEC.md`
