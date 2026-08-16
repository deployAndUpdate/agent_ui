# Technical specification: Visual Agent Engine (TUI)

## 1. Purpose

**Visual Agent Engine** is a terminal Server-Driven UI: an AI agent publishes a JSON manifest, the backend validates it (AJV), persists it, and pushes updates over WebSocket to a **Ratatui** client.

Web / React / Scene Graph are **removed**. The only client is `tui/`.

## 2. Pipeline

```
[CLI Agent] → TuiManifest JSON → [AJV Gatekeeper]
                                      │
                         ┌────────────┴────────────┐
                     [400]                      [Valid]
                         │                          │
                  [Self-Healing]            [tui_sessions + tui_outbox]
                                                    │
                                            [WS RENDER_MANIFEST]
                                                    │
                                              [Ratatui tui/]
```

## 3. Contract — TuiManifest

Schema (source of truth): `packages/tui-shared/schemas/tui-manifest.schema.json`.

Types: `Paragraph`, `Table`, `List`, `Gauge`, `Chart` (`props.kind`: `line` | `bar` | `sparkline` | `pie` | `stacked`).  
Layout: `direction` + `chunks[]` (`widgetId`, `type`, integer `size`, `props`).

**Drift guard:** golden fixtures live in `packages/tui-shared/tests/fixtures/` (`hello.tui.json`, `charts.tui.json`, `detail_w_table_0.json`). TS runs AJV via `validateTuiManifest`; Rust deserializes the same files in `tui/tests/fixture_json.rs`. Change order: schema → TS types → Rust `model.rs`.

USER_ACTION: `select_row` (Table), `select_point` (Chart), `navigate_back`, `command` `/details` | `/prompt`.

## 4. API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/tui/manifest` | Accept manifest |
| GET | `/api/v1/tui/session/:sessionId` | Latest snapshot |
| POST | `/api/v1/tui/action` | USER_ACTION |
| WS | `/api/v1/tui/stream?sessionId=` | Realtime |
| GET | `/health` | Liveness |
| GET | `/ready` | Readiness |

Default port: `3001`.

## 5. Database

Tables: `tui_sessions`, `tui_outbox`, `tui_actions`, `tui_idempotency_keys` (`backend/migrations/001_tui.sql`).

## 6. Self-Healing

CLI (`npm run agent -- submit`) on HTTP 400 repairs common mistakes (`widgets`→`chunks`, `{w,h}`→`size`, unknown type→`Paragraph`) and retries.

The Express API does **not** call an LLM. `/details` and `/prompt` go to the agent daemon (`packages/tui-agent-bridge`). If the model returns invalid JSON, the daemon sends the parse/AJV error back on the same agent session (up to `TUI_BRIDGE_JSON_RETRIES`, default 3) and only then POSTs `/manifest`. After that budget, it callbacks an error board so the TUI leaves the loader.
