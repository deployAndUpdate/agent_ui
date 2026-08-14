---
name: visual-agent-engine
description: >-
  Builds and publishes Server-Driven UI dashboards via Visual Agent Engine TUI
  track (TuiManifest → AJV → /api/v1/tui/manifest → Ratatui). Use when the user
  asks to create/update a dashboard, widgets, Paragraph, Table, List, Gauge,
  Chart, SDUI UI, visual-engine, TUI, or to push a manifest to the Visual Agent
  Engine / visual-agent CLI.
---

# Visual Agent Engine (TUI only)

Never generate raw HTML/JS/React. Emit a **TuiManifest** JSON and submit it to the TUI API/CLI. The client is Ratatui (`npm run dev:tui`).

## Prerequisites

From repo root `visual_engine`:

1. `./install` (once) — Node, npm ci, release `vae-tui`
2. Backend+TUI: `./vae` or `./vae --demo`
3. Optional auth: `X-API-Key` / `VISUAL_ENGINE_API_KEY` when `AUTH_ENABLED=true`

## Workflow (always)

```
Task:
- [ ] 1. Choose sessionId
- [ ] 2. Write TuiManifest JSON (schema-valid)
- [ ] 3. Submit via CLI (self-healing) or curl
- [ ] 4. On 400: fix from errors[], resubmit
- [ ] 5. Tell user to view npm run dev:tui (same sessionId)
```

### 1. Session

- Default `sessionId`: `demo` (or user-provided)
- No web `version` lock — last-write-wins
- Optional check:

```bash
curl -s "http://127.0.0.1:3001/api/v1/tui/session/<SESSION>"
```

404 → empty session.

### 2. Write the manifest

Save e.g. `./.vae/manifest.tui.json`.

**Hard rules:**

- `operation`: `SYNC_DASHBOARD` | `ADD_WIDGET` | `UPDATE_WIDGET` | `REMOVE_WIDGET`
- Chunk `type`: only `Paragraph` | `Table` | `List` | `Gauge` | `Chart`
- Chunk `size`: positive integer (row weight / height hint) — **not** `{w,h}`
- Required: `widgetId`, `type`, `size`, `props`
- `layout.direction`: `vertical` | `horizontal`
- Props: [reference.md](reference.md)
- Prefer `SYNC_DASHBOARD` for a full board
- **Dumb templates** — all text/numbers come from `props`

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

More: [examples.md](examples.md).

### 3. Submit (preferred CLI)

```bash
npm run agent -- submit \
  --session <SESSION> \
  --file <PATH_TO_TUI_MANIFEST.json>
```

Self-Healing on HTTP 400 (up to 3). Prefer a valid manifest first.

Raw HTTP:

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

- How to view: `TUI_SESSION_ID=<SESSION> npm run dev:tui`
- `sessionId`, `taskId`, operation
- Brief list of chunks

## Interaction

WS or `POST /api/v1/tui/action`:

```json
{
  "event": "USER_ACTION",
  "taskId": "req_...",
  "widgetId": "w_results",
  "action": "select_row",
  "payload": { "rowIndex": 0 }
}
```

When reacting: push a new `SYNC_DASHBOARD` / delta with updated chunks.

Builtin reactor (`TUI_ACTION_REACTOR=builtin`, default):

- `select_row` → detail screen (Paragraph fields from table headers/row)
- `navigate_back` → restore previous board

Set `TUI_ACTION_REACTOR=off` to only record actions (external agent reacts).

## Do / Don't

| Do | Don't |
|----|-------|
| TUI types only | MetricCard / DataChart / React / HTML |
| `layout.chunks` + integer `size` | `layout.widgets` + `{w,h}` |
| CLI or `/api/v1/tui/manifest` | Claim UI updated without 200 |

## Repo map

- Schema: `packages/tui-shared/schemas/tui-manifest.schema.json`
- CLI: `packages/cli` (`npm run agent -- submit ...`)
- Client: `tui/` (Ratatui)
- Spec: `docs/TECHNICAL_SPEC.md`
