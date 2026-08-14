---
name: visual-agent-engine
description: >-
  Builds and publishes Server-Driven UI dashboards via Visual Agent Engine to
  BOTH tracks: web (DashboardManifest → /api/manifest → React) and TUI
  (TuiManifest → /api/v1/tui/manifest → Ratatui stub). Use when the user asks
  to create/update a dashboard, widgets, MetricCard, DataChart, ActionLog,
  DataTable, Paragraph, Table, SDUI UI, visual-engine, TUI, or to push a
  manifest to the Visual Agent Engine / visual-agent CLI.
---

# Visual Agent Engine

Never generate raw HTML/JS for the dashboard. Always emit **two** schema-valid JSON manifests and submit **both** tracks (web + TUI) for the same `sessionId` / `taskId`.

| Track | Manifest | Submit | Client |
|-------|----------|--------|--------|
| **Web** | `DashboardManifest` (`layout.widgets`) | CLI or `POST /api/manifest` | `http://localhost:5173/?sessionId=` |
| **TUI** | `TuiManifest` (`layout.chunks`) | `POST /api/v1/tui/manifest` | `npm run dev:tui` |

## Prerequisites

From repo root `visual_engine`:

1. Backend: `npm run dev:backend` → `http://127.0.0.1:3001`
2. Optional web UI: `npm run dev:frontend` → `http://localhost:5173/?sessionId=<SESSION>`
3. Optional TUI: `npm run dev:tui` (WS `…/api/v1/tui/stream?sessionId=<SESSION>`)
4. Optional auth: `X-API-Key` / `VISUAL_ENGINE_API_KEY` when `AUTH_ENABLED=true`

If backend is down, start it before submitting.

## Workflow (always — both tracks)

```
Task:
- [ ] 1. Choose sessionId + next web version
- [ ] 2. Write web DashboardManifest JSON
- [ ] 3. Write TUI TuiManifest JSON (same taskId / same data story)
- [ ] 4. Submit web (CLI preferred)
- [ ] 5. Submit TUI (curl / HTTP)
- [ ] 6. On 400: fix that track's JSON from errors[], resubmit
- [ ] 7. Tell user web URL + that `npm run dev:tui` should show the Ratatui board
```

**Hard rule:** do not stop after web-only success. TUI submit is mandatory unless the user explicitly says «только веб» / «только TUI».

### 1. Session + version (web)

- Default `sessionId`: `demo` (or user-provided). Use the **same** `sessionId` for TUI.
- Web `version`: positive integer, **strictly greater** than current dashboard version.
- First web push: `version: 1`. After success, increment (`2`, `3`, …).
- Check web snapshot:

```bash
curl -s "http://127.0.0.1:3001/api/dashboard/<SESSION>"
```

404 → start at version `1`.

TUI has **no** version lock (last-write-wins). Optional check:

```bash
curl -s "http://127.0.0.1:3001/api/v1/tui/session/<SESSION>"
```

### 2. Write web manifest

Save e.g. `./.vae/manifest.web.json`.

**Rules:**

- `operation`: `SYNC_DASHBOARD` | `ADD_WIDGET` | `UPDATE_WIDGET` | `REMOVE_WIDGET`
- Widget `type`: only `MetricCard` | `DataChart` | `ActionLog` | `DataTable`
- `size.w`: 1–12, `size.h`: 1–6
- Required: `widgetId`, `type`, `size`, `props`
- Props per type: [reference.md](reference.md)
- Prefer `SYNC_DASHBOARD` for a full board
- **Dumb templates** — all text/numbers come from `props`

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

### 3. Write TUI manifest (parallel)

Save e.g. `./.vae/manifest.tui.json`. Same `taskId` and the same facts as the web board, adapted to terminal chunks.

**Rules:**

- `operation`: same enum as web (prefer `SYNC_DASHBOARD`)
- `layout.direction`: `vertical` | `horizontal` (default vertical)
- Chunk `type`: only `Paragraph` | `Table` | `List` | `Gauge` | `Chart`
- Chunk `size`: positive integer (row weight / height hint) — **not** `{w,h}`
- Required: `widgetId`, `type`, `size`, `props`
- Props: [reference.md](reference.md#tui-props-by-type)

**Mapping hint (web → TUI):**

| Web | TUI |
|-----|-----|
| MetricCard | Paragraph (`title` + `text` with value) or Gauge |
| DataTable | Table (`headers` + string `rows`) |
| ActionLog | List (`items` from entry texts) |
| DataChart | Chart (`datasets[].name/data`) or Paragraph summary |

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
        "props": {
          "title": "Users",
          "text": "42",
          "style": "cyan"
        }
      }
    ]
  }
}
```

More examples: [examples.md](examples.md).

### 4. Submit web (preferred CLI)

```bash
npm run agent -- submit \
  --session <SESSION> \
  --version <N> \
  --file <PATH_TO_WEB_MANIFEST.json>
```

Self-Healing on HTTP 400 (up to 3 retries). Prefer a valid manifest first.

Raw HTTP:

```bash
curl -s http://127.0.0.1:3001/api/manifest \
  -H 'content-type: application/json' \
  -H "Idempotency-Key: <unique-per-logical-request>" \
  -H "X-API-Key: $VISUAL_ENGINE_API_KEY" \
  -d "{\"sessionId\":\"<SESSION>\",\"version\":<N>,\"manifest\":$(cat <WEB.json>)}"
```

- `200` → web outbox → WS `/ws`
- `400` → fix web JSON
- `409` → bump `version` after GET snapshot
- `401` → API key

### 5. Submit TUI (required)

No CLI yet — use HTTP:

```bash
curl -s http://127.0.0.1:3001/api/v1/tui/manifest \
  -H 'content-type: application/json' \
  -H "Idempotency-Key: <unique-tui-key>" \
  -H "X-API-Key: $VISUAL_ENGINE_API_KEY" \
  -d "{\"sessionId\":\"<SESSION>\",\"manifest\":$(cat <TUI.json>)}"
```

- `200` → TUI outbox → WS `/api/v1/tui/stream` → Ratatui client redraws
- `400` → fix TUI JSON from `errors[]` (Self-Healing by hand), resubmit

### 6. User-facing result

Always return:

- Web UI: `http://localhost:5173/?sessionId=<SESSION>` (add `&apiKey=...` if auth)
- TUI: `npm run dev:tui` (same `sessionId`; PgUp/PgDn scroll, `q` quit)
- `sessionId`, web `version`, both operations
- Brief list of web widgets **and** TUI chunks

## Interaction loops

**Web** — `POST /api/widget-interaction`:

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

**TUI** — WS or `POST /api/v1/tui/action`:

```json
{
  "event": "USER_ACTION",
  "taskId": "req_...",
  "widgetId": "w_results",
  "action": "select_row",
  "payload": { "rowIndex": 0 }
}
```

When reacting: update **both** manifests (next web version + TUI SYNC) unless user scoped to one track.

## Do / Don't

| Do | Don't |
|----|-------|
| Submit web **and** TUI every time | Publish only web and claim “done” |
| Same `sessionId` + `taskId` on both | Mix web widget types into TUI chunks |
| Web types: MetricCard/… | TUI types: Paragraph/Table/… |
| Increment web `version` | Reuse a web version that already succeeded |
| Map the same data into both schemas | Put `{w,h}` size on TUI chunks |

## Repo map

- Web schema: `packages/shared/schemas/dashboard-manifest.schema.json`
- TUI schema: `packages/tui-shared/schemas/tui-manifest.schema.json`
- CLI (web): `packages/cli` (`npm run agent -- submit ...`)
- Spec: `docs/TECHNICAL_SPEC.md`
- TUI goal: `docs/goals/07-tui-ratatui.md`
