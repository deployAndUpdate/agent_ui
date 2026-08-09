---
name: visual-agent-engine
description: >-
  Builds and publishes Server-Driven UI dashboards via Visual Agent Engine
  (JSON DashboardManifest → AJV gatekeeper → outbox → WebSocket UI). Use when
  the user asks to create/update a dashboard, widgets, MetricCard, DataChart,
  ActionLog, DataTable, SDUI UI, visual-engine, or to push a manifest to the
  Visual Agent Engine / visual-agent CLI.
---

# Visual Agent Engine

Never generate raw HTML/JS for the dashboard. Only emit a **DashboardManifest** JSON and submit it through the engine API/CLI.

## Prerequisites

From repo root `visual_engine` (or path where this project lives):

1. Backend: `npm run dev:backend` → `http://127.0.0.1:3001`
2. Frontend: `npm run dev:frontend` → `http://localhost:5173/?sessionId=<SESSION>`
3. Optional auth: `X-API-Key` / `VISUAL_ENGINE_API_KEY` when `AUTH_ENABLED=true`

If services are down, start them before submitting.

## Workflow (always)

```
Task:
- [ ] 1. Choose sessionId + next version
- [ ] 2. Write manifest JSON (schema-valid)
- [ ] 3. Submit via CLI (self-healing)
- [ ] 4. On failure: fix from API errors, resubmit with same or next version as needed
- [ ] 5. Tell user the UI URL
```

### 1. Session + version

- Default `sessionId`: `demo` (or user-provided).
- `version` must be a **positive integer** and **strictly greater** than the current dashboard version.
- First push for a new session: `version: 1`.
- After success, increment for the next change (`2`, `3`, …).
- Check current snapshot if unsure:

```bash
curl -s "http://127.0.0.1:3001/api/dashboard/<SESSION>"
```

404 → session empty → start at version `1`.

### 2. Write the manifest

Save to a temp file, e.g. `/tmp/vae-manifest.json` or `./.vae/manifest.json`.

**Hard rules:**

- `operation`: one of `SYNC_DASHBOARD` | `ADD_WIDGET` | `UPDATE_WIDGET` | `REMOVE_WIDGET`
- Widget `type`: only `MetricCard` | `DataChart` | `ActionLog` | `DataTable`
- `size.w`: 1–12, `size.h`: 1–6
- Required widget fields: `widgetId`, `type`, `size`, `props`
- Props must match the widget type (see [reference.md](reference.md))
- Prefer `SYNC_DASHBOARD` for a full board; use ADD/UPDATE/REMOVE for deltas

Minimal template:

```json
{
  "taskId": "req_<short_id>",
  "operation": "SYNC_DASHBOARD",
  "layout": {
    "widgets": [
      {
        "widgetId": "w_01",
        "type": "MetricCard",
        "size": { "w": 4, "h": 2 },
        "props": { "title": "Users", "value": 42 }
      }
    ]
  }
}
```

More examples: [examples.md](examples.md). Full props: [reference.md](reference.md).

### 3. Submit (preferred)

From repo root:

```bash
npm run agent -- submit \
  --session <SESSION> \
  --version <N> \
  --file <PATH_TO_MANIFEST.json>
```

With auth / custom API:

```bash
npm run agent -- submit \
  --session <SESSION> \
  --version <N> \
  --file <PATH_TO_MANIFEST.json> \
  --api http://127.0.0.1:3001 \
  --api-key "$VISUAL_ENGINE_API_KEY"
```

CLI runs **Self-Healing**: on HTTP 400 it repairs common schema mistakes and retries (up to 3). Still prefer emitting a valid manifest first.

### 4. Alternative: raw HTTP

```bash
curl -s http://127.0.0.1:3001/api/manifest \
  -H 'content-type: application/json' \
  -H "Idempotency-Key: <unique-per-logical-request>" \
  -H "X-API-Key: $VISUAL_ENGINE_API_KEY" \
  -d "{\"sessionId\":\"<SESSION>\",\"version\":<N>,\"manifest\":$(cat <PATH_TO_MANIFEST.json>)}"
```

- `200` → success (`outboxEventId` in body); UI updates over WS
- `400` → read `errors[]`, fix JSON, retry (same version if not accepted)
- `409` → stale/optimistic lock → bump `version` after GET snapshot
- `401` → missing/wrong API key

### 5. User-facing result

Always return:

- UI link: `http://localhost:5173/?sessionId=<SESSION>` (add `&apiKey=...` if auth)
- `sessionId`, `version`, operation used
- Brief list of widgets created/updated

## Widget interaction loop

User actions POST to `/api/widget-interaction` as:

```json
{
  "type": "widget_interaction",
  "taskId": "req_...",
  "widgetId": "w_01",
  "action": "export_csv",
  "payload": { "format": "csv" },
  "timestamp": "2026-06-06T12:00:00Z"
}
```

When the user asks to react to UI actions: inspect the request/payload, then push an `UPDATE_WIDGET` / `ADD_WIDGET` / `SYNC_DASHBOARD` with the next version.

## Do / Don't

| Do | Don't |
|----|-------|
| Use only registry widget types | Emit HTML, JSX, or chart libraries as code |
| Increment version per accepted write | Reuse a version that already succeeded |
| Validate props per widget type | Put unknown `type` values |
| Use CLI submit for healing | Claim the UI updated without a successful submit |

## Repo map

- Schema: `packages/shared/schemas/dashboard-manifest.schema.json`
- Props: `packages/shared/schemas/props/*.props.schema.json`
- CLI: `packages/cli` (`npm run agent -- submit ...`)
- Spec: `docs/TECHNICAL_SPEC.md`
