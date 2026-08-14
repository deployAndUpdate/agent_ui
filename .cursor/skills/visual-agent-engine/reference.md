# Visual Agent Engine — reference

## Dual-track publish

Every agent update should hit **both**:

1. Web: `POST /api/manifest` with `DashboardManifest`
2. TUI: `POST /api/v1/tui/manifest` with `TuiManifest`

Same `sessionId`. Same `taskId` inside both manifests.

---

## Web envelope — POST `/api/manifest`

```json
{
  "sessionId": "demo",
  "version": 1,
  "manifest": { "...DashboardManifest..." },
  "idempotencyKey": "optional-if-not-using-header"
}
```

Headers:

- `Idempotency-Key` — replay-safe retries of the **same** logical write
- `X-API-Key` — required when auth enabled

## DashboardManifest (web)

| Field | Rules |
|-------|--------|
| `taskId` | non-empty string |
| `operation` | `SYNC_DASHBOARD` \| `ADD_WIDGET` \| `UPDATE_WIDGET` \| `REMOVE_WIDGET` |
| `layout.widgets` | array of widgets |

### Operations

| Operation | Meaning of `layout.widgets` |
|-----------|------------------------------|
| `SYNC_DASHBOARD` | Full replace of board |
| `ADD_WIDGET` | Upsert listed widgets into existing board |
| `UPDATE_WIDGET` | Replace existing widgets by `widgetId` |
| `REMOVE_WIDGET` | Remove widgets by `widgetId` (props may be empty `{}`) |

### Widget common fields

| Field | Rules |
|-------|--------|
| `widgetId` | non-empty string, stable id |
| `type` | `MetricCard` \| `DataChart` \| `ActionLog` \| `DataTable` |
| `size.w` | integer 1..12 |
| `size.h` | integer 1..6 |
| `props` | object; schema depends on `type` (skipped for `REMOVE_WIDGET`) |

## Props by type (web)

### MetricCard

Required: `title` (string), `value` (any)  
Optional: `unit`, `subtitle`, `change`, `changeType` (`up` \| `down`), `icon` (string — emoji или текст, как есть), `imageUrl`, `imageAlt`

**Hero layout** — если задан `imageUrl`, карточка рендерится как welcome-баннер.  
**Agent rule:** один welcome-`MetricCard` с тематическим `imageUrl` (публичная картинка по теме дашборда).

### DataChart

Required: `title` (string), `series` (array)  
Each series item: `{ "name": string, "points": number[] }`  
Optional: `chartType` (`line` \| `bar` \| `area`), `labels` (string[]), `stats` (`{ label, value }[]`)

### ActionLog

Required: `entries` (array)  
Each entry: `{ "at": string, "text": string }` — optional `amount` for order-style feeds  
Optional: `title`

### DataTable

Required: `columns` (string[], min 1), `rows` (object[])  
Optional: `title`, `progressColumns` (string[] — колонки с progress bar for numeric values)

## Grid layout tips (web)

- 12-column grid; `w: 4` ≈ one third, `w: 6` half, `w: 12` full width
- Keep `h` small (2–3) for metrics; 3–4 for charts/tables
- Unique `widgetId` per widget (`w_01`, `w_revenue`, …)

---

## TUI envelope — POST `/api/v1/tui/manifest`

```json
{
  "sessionId": "demo",
  "manifest": { "...TuiManifest..." }
}
```

No `version` field. Optional `Idempotency-Key` / `X-API-Key` same as web.

## TuiManifest

| Field | Rules |
|-------|--------|
| `taskId` | non-empty string (match web) |
| `operation` | same enum as web |
| `layout.direction` | `vertical` \| `horizontal` (optional, default vertical) |
| `layout.chunks` | array of chunks |

### Chunk common fields

| Field | Rules |
|-------|--------|
| `widgetId` | non-empty string |
| `type` | `Paragraph` \| `Table` \| `List` \| `Gauge` \| `Chart` |
| `size` | integer ≥ 1 (terminal weight / height) |
| `props` | object; schema depends on `type` |

## TUI props by type

### Paragraph

Required: `text`  
Optional: `title`, `style` (`default` \| `cyan` \| `green` \| `yellow` \| `red` \| `magenta` \| `blue` \| `white`)

### Table

Required: `headers` (string[], min 1), `rows` (array of string arrays)

### List

Required: `items` (string[])  
Optional: `title`, `selectedIndex` (≥ 0)

### Gauge

Required: `ratio` (number 0..1)  
Optional: `title`, `label`

### Chart

Required: `datasets` — `[{ "name": string, "data": number[] }]` (min 1)  
Optional: `title`

## Web → TUI mapping

| Web widget | Typical TUI chunk |
|------------|-------------------|
| MetricCard | Paragraph (`title` + value in `text`) or Gauge |
| DataTable | Table — stringify cell values into `rows` |
| ActionLog | List — `items` from `entries[].text` |
| DataChart | Chart — map `series[].points` → `datasets[].data` |

Keep the same narrative (titles, numbers, row order) so web and stub stay in sync.

---

## Env

| Variable | Default | Purpose |
|----------|---------|---------|
| `VISUAL_ENGINE_API` | `http://127.0.0.1:3001` | CLI API base |
| `VISUAL_ENGINE_API_KEY` | — | CLI / UI auth |
| `AUTH_ENABLED` | false | backend auth switch |
| `API_KEYS` | — | comma-separated valid keys |
| `DATABASE_URL` | unset = memory | Postgres |
| `TUI_WS_URL` | `ws://127.0.0.1:3001/api/v1/tui/stream?sessionId=demo` | Rust stub |

## Endpoints

| Method | Path | Track | Notes |
|--------|------|-------|-------|
| POST | `/api/manifest` | Web | validate + persist + outbox |
| GET | `/api/dashboard/:sessionId` | Web | latest snapshot |
| POST | `/api/widget-interaction` | Web | UI events |
| WS | `/ws?sessionId=` | Web | `dashboard_update` |
| POST | `/api/v1/tui/manifest` | TUI | validate + persist + outbox |
| GET | `/api/v1/tui/session/:sessionId` | TUI | latest snapshot |
| POST | `/api/v1/tui/action` | TUI | `USER_ACTION` HTTP fallback |
| WS | `/api/v1/tui/stream?sessionId=` | TUI | `RENDER_MANIFEST` / `USER_ACTION` |
| GET | `/health` | — | liveness |
