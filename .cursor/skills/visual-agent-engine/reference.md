# Visual Agent Engine — TUI reference

## Envelope — POST `/api/v1/tui/manifest`

```json
{
  "sessionId": "demo",
  "manifest": { "...TuiManifest..." }
}
```

Headers:

- `Idempotency-Key` — optional replay-safe retries
- `X-API-Key` — when auth enabled

No `version` field (last-write-wins).

## TuiManifest

| Field | Rules |
|-------|--------|
| `taskId` | non-empty string |
| `operation` | `SYNC_DASHBOARD` \| `ADD_WIDGET` \| `UPDATE_WIDGET` \| `REMOVE_WIDGET` |
| `layout.direction` | `vertical` \| `horizontal` (optional) |
| `layout.chunks` | array of chunks |

### Chunk fields

| Field | Rules |
|-------|--------|
| `widgetId` | non-empty string |
| `type` | `Paragraph` \| `Table` \| `List` \| `Gauge` \| `Chart` |
| `size` | integer ≥ 1 |
| `props` | object per type |

## Props by type

### Paragraph

Required: `text`  
Optional: `title`, `style` (`default` \| `cyan` \| `green` \| `yellow` \| `red` \| `magenta` \| `blue` \| `white`)

### Table

Required: `headers` (string[]), `rows` (string[][])

Interactive: in TUI, `i` → browse → yellow hover → `Enter` activates Table → row select → `Enter` sends `select_row`. Prefer stable ids like `w_table` / `w_results`.

### List

Required: `items` (string[])  
Optional: `title`, `selectedIndex`

### Gauge

Required: `ratio` (0..1)  
Optional: `title`, `label`

### Chart

Required: `datasets` — `[{ "name", "data": number[] }]`  
Optional: `title`

## TUI navigation

Modes: `Idle` → `i` → `Browse` → `Enter` on Table → `TableInteract` → `Enter` on row → detail → `i` → `/details` → agent enrich → `Esc` back.

| Mode | Keys | UI |
|------|------|-----|
| Idle | `i` browse; Tab/`[` `]` focus; ↑↓/`jk` widget scroll; PgUp/PgDn page; `q` quit | cyan Tab focus |
| Browse | ↑↓ = page (±5, same as PgUp/PgDn); Enter open Table; Esc → Idle | yellow hover |
| Table | ↑↓/`jk` row; Enter → `select_row`; Esc → Browse | yellow border + row |
| Detail | `i` cmd; Esc → `navigate_back`; `q` quit | detail board |
| Command | type `/details`; Enter submit; Esc cancel | cmdline `: /…` |
| AwaitEnrich | wait for agent SYNC | status: waiting agent |

`Esc` does not quit the app (only `q`). In CommandInsert, Esc cancels the cmdline (does not navigate_back).

## Detail command `/details`

On DetailScreen: `i` → type `/details` → Enter.

Client sends `action: "command"` with `payload.systemPrompt` = `more details`. Backend POSTs to `TUI_AGENT_WEBHOOK_URL`. Agent must callback:

```bash
POST /api/v1/tui/manifest
{ "sessionId": "<same>", "manifest": { "taskId": "detail_…", "operation": "SYNC_DASHBOARD", "layout": { ... } } }
```

Keep `taskId` prefix `detail_` so the TUI stays on DetailScreen. Backend treats `detail_*` POSTs as **ephemeral** (outbox only; session board unchanged).

### Local / universal agent bridge

Any agent that accepts the webhook JSON and POSTs `detail_*` to `callback.manifestUrl` works
(Cursor, Claude Code, OpenCode, custom). Optional helper:

`./vae` starts the daemon on `:9090`. Default driver `auto`: warm Cursor SDK (`Agent.create` + `send`) when `CURSOR_API_KEY` is set, otherwise in-process stub. Health: `GET http://127.0.0.1:9090/health`.

```bash
export TUI_AGENT_WEBHOOK_URL=http://127.0.0.1:9090/agent
# optional overrides:
# TUI_BRIDGE_DRIVER=exec TUI_BRIDGE_COMMAND='node packages/tui-agent-bridge/examples/enrich-echo.mjs' npm run bridge
# TUI_BRIDGE_DRIVER=forward TUI_BRIDGE_FORWARD_URL=http://127.0.0.1:9100/enrich npm run bridge
```

Schema: `packages/tui-agent-bridge/schemas/tui-agent-webhook.schema.json`. Package README has driver matrix.

## USER_ACTION wire format

WS frame or body of `POST /api/v1/tui/action` (with `sessionId` for HTTP):

```json
{
  "event": "USER_ACTION",
  "taskId": "req_...",
  "widgetId": "w_table",
  "action": "select_row",
  "payload": { "rowIndex": 0, "row": ["col0", "col1"] }
}
```

```json
{
  "event": "USER_ACTION",
  "taskId": "detail_w_table_0",
  "widgetId": "w_table",
  "action": "navigate_back",
  "payload": {}
}
```

Builtin detail board uses Paragraph chunks `w_detail_title` / `w_detail_body` / `w_detail_hint`. Override by setting `TUI_ACTION_REACTOR=off` and submitting your own `SYNC_DASHBOARD`.

## Env

| Variable | Default |
|----------|---------|
| `VISUAL_ENGINE_API` | `http://127.0.0.1:3001` |
| `VISUAL_ENGINE_API_KEY` | — |
| `TUI_WS_URL` | `ws://127.0.0.1:3001/api/v1/tui/stream?sessionId=demo` |
| `TUI_SESSION_ID` | `demo` |
| `TUI_ACTION_REACTOR` | `builtin` (`off` to disable select_row/navigate_back) |
| `TUI_AGENT_WEBHOOK_URL` | `http://127.0.0.1:9090/agent` (`./vae` default) |
| `TUI_AGENT_WEBHOOK_TOKEN` | — (optional Bearer) |
| `TUI_BRIDGE_DRIVER` | `auto` (`sdk` if `CURSOR_API_KEY`, else `stub`) |
| `CURSOR_API_KEY` | — (warm SDK daemon) |

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/tui/manifest` | validate + persist + outbox |
| GET | `/api/v1/tui/session/:sessionId` | latest snapshot |
| POST | `/api/v1/tui/action` | USER_ACTION HTTP |
| WS | `/api/v1/tui/stream?sessionId=` | RENDER_MANIFEST / USER_ACTION |
| GET | `/health` | liveness |
| GET | `/ready` | readiness |
