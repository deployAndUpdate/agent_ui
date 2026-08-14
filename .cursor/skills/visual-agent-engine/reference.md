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

### List

Required: `items` (string[])  
Optional: `title`, `selectedIndex`

### Gauge

Required: `ratio` (0..1)  
Optional: `title`, `label`

### Chart

Required: `datasets` — `[{ "name", "data": number[] }]`  
Optional: `title`

## Env

| Variable | Default |
|----------|---------|
| `VISUAL_ENGINE_API` | `http://127.0.0.1:3001` |
| `VISUAL_ENGINE_API_KEY` | — |
| `TUI_WS_URL` | `ws://127.0.0.1:3001/api/v1/tui/stream?sessionId=demo` |
| `TUI_SESSION_ID` | `demo` |

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/tui/manifest` | validate + persist + outbox |
| GET | `/api/v1/tui/session/:sessionId` | latest snapshot |
| POST | `/api/v1/tui/action` | USER_ACTION HTTP |
| WS | `/api/v1/tui/stream?sessionId=` | RENDER_MANIFEST / USER_ACTION |
| GET | `/health` | liveness |
