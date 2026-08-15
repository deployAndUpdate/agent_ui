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

Modes: `Idle` (`p` prompt on the root board) → `i` → `Browse` (`p` prompt) → `Enter` on Table → `TableInteract` → `Enter` on row → stub detail → auto `/details` (cached on later visits) → `i` browse on detail → `Tab` / `p` → `Esc` back.

| Mode | Keys | UI |
|------|------|-----|
| Idle | `i` browse; `p` prompt; Tab/`[` `]` focus; ↑↓/`jk` widget scroll; PgUp/PgDn page; `q` quit | cyan Tab focus |
| Browse | ↑↓ = page (±5, same as PgUp/PgDn); `p` prompt; Enter open Table; Esc → Idle | yellow hover |
| Table | ↑↓/`jk` row; Enter → `select_row`; Esc → Browse | yellow border + row |
| Detail | `i` browse; Tab/`[` `]` focus; `p` prompt; Esc → `navigate_back`; `q` quit | cyan Tab focus |
| DetailBrowse | ↑↓ page (yellow hover); `p` prompt; Esc → Detail | yellow hover |
| Prompt | type; Enter send; Esc cancel (`q` is a letter) | overlay text box |
| AwaitEnrich | wait for agent SYNC | overlay spinner |

`Esc` does not quit the app (only `q`). In PromptInsert, Esc cancels the box (does not navigate_back).

## Detail command `/details`

Opening a table row auto-sends `action: "command"` `/details` (`payload.systemPrompt` = `more details`) after the builtin stub lands. Backend POSTs to `TUI_AGENT_WEBHOOK_URL`. Agent must callback:

```bash
POST /api/v1/tui/manifest
{ "sessionId": "<same>", "manifest": { "taskId": "detail_…", "operation": "SYNC_DASHBOARD", "layout": { ... } } }
```

Keep `taskId` prefix `detail_` so the TUI stays on DetailScreen. Backend treats `detail_*` POSTs as **ephemeral** (outbox only; session board unchanged). The TUI caches the enriched board per table row (`widgetId:row`); reopening that row shows the cache and does not re-send `/details`. Detail `/prompt` updates the cache. Root-board `/prompt` is **not** cached as a detail overlay.

## Prompt command `/prompt`

On the **root board** (Idle or Browse, not TableInteract): Tab or hover a widget (optional) → `p` → type → Enter. Payload `scope` is `"board"`. The daemon merges returned chunks into `payload.currentDetail` and callbacks with the **session `taskId`** (must **not** start with `detail_`), so `POST /manifest` persists the session board.

On **DetailScreen**: Tab to a widget (optional) → `p` → type → Enter. Payload `scope` is `"detail"`. The daemon merges into the current detail board and callbacks the same `detail_*` taskId (ephemeral).

Webhook `command` is `/prompt`. `systemPrompt` / `userPrompt` is the typed text. Payload includes `scope`, `focusedWidgetId`, `focusedChunk`, `currentDetail` (the board on screen). Same-widgetId updates, new ids append.

### Local / universal agent bridge

Any agent that accepts the webhook JSON and POSTs a TuiManifest to `callback.manifestUrl` works
(Cursor, Claude Code, OpenCode, custom). Use `detail_*` for ephemeral detail overlays; other `taskId`s persist the root board. Optional helper:

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
