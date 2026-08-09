# Visual Agent Engine — reference

## Envelope for POST `/api/manifest`

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

## DashboardManifest

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

## Props by type

### MetricCard

Required: `title` (string), `value` (any)  
Optional: `unit` (string)

### DataChart

Required: `title` (string), `series` (array)  
Each series item: `{ "name": string, "points": number[] }`

### ActionLog

Required: `entries` (array)  
Each entry: `{ "at": string, "text": string }` (ISO timestamp preferred)

### DataTable

Required: `columns` (string[], min 1), `rows` (object[])

## Grid layout tips

- 12-column grid; `w: 4` ≈ one third, `w: 6` half, `w: 12` full width
- Keep `h` small (2–3) for metrics; 3–4 for charts/tables
- Unique `widgetId` per widget (`w_01`, `w_revenue`, …)

## Env

| Variable | Default | Purpose |
|----------|---------|---------|
| `VISUAL_ENGINE_API` | `http://127.0.0.1:3001` | CLI API base |
| `VISUAL_ENGINE_API_KEY` | — | CLI / UI auth |
| `AUTH_ENABLED` | false | backend auth switch |
| `API_KEYS` | — | comma-separated valid keys |
| `DATABASE_URL` | unset = memory | Postgres |

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/manifest` | validate + persist + outbox |
| GET | `/api/dashboard/:sessionId` | latest snapshot |
| POST | `/api/widget-interaction` | UI events |
| WS | `/ws?sessionId=` | `dashboard_update` messages |
| GET | `/health` | liveness |
