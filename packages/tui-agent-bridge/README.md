# TUI Agent Bridge (daemon)

Long-lived `/details` adapter. `./vae` starts it on `127.0.0.1:9090`. Visual Engine does **not** embed an LLM; this process owns the warm agent session.

```
TUI /details
  → POST TUI_AGENT_WEBHOOK_URL   (schema: schemas/tui-agent-webhook.schema.json)
  → this daemon (queue per sessionId)
  → POST callback.manifestUrl    { sessionId, manifest }  (taskId must be detail_*)
```

## Default driver (`auto`)

| Condition | Driver |
|-----------|--------|
| `CURSOR_API_KEY` set | **`sdk`** — `Agent.create` at boot, `agent.send` per `/details` (no Cursor CLI fork) |
| `TUI_BRIDGE_FORWARD_URL` | `forward` |
| `TUI_BRIDGE_COMMAND` set | `exec` (any CLI wrapper) |
| otherwise | `stub` (in-process template) |

`GET /health` → `{ ok, role: "daemon", driver, llm: "n/a"|"warming"|"ready"|"error", busySessions }`.

Jobs for the same `sessionId` run one at a time. Unknown commands (not `/details`) fail and callback an error detail board so the TUI leaves AwaitEnrich.

## Drivers

| Driver | Use when | Config |
|--------|----------|--------|
| **`sdk`** | Warm Cursor agent (preferred) | `CURSOR_API_KEY` |
| **`exec`** | Any CLI agent | `TUI_BRIDGE_COMMAND` — stdin JSON → stdout TuiManifest |
| **`forward`** | Remote HTTP agent | `TUI_BRIDGE_FORWARD_URL` (+ `sync`/`async`) |
| `stub` | Inline template (no subprocess) | — |
| `cli` | One-shot Cursor CLI (cold) | `agent` login / `TUI_BRIDGE_AGENT_BIN` |

```bash
# Claude / OpenCode via exec (optional; not started by default)
TUI_BRIDGE_DRIVER=exec TUI_BRIDGE_COMMAND=bash packages/tui-agent-bridge/examples/enrich-claude.sh
TUI_BRIDGE_DRIVER=exec TUI_BRIDGE_COMMAND=bash packages/tui-agent-bridge/examples/enrich-opencode.sh
```

### `exec` contract

```bash
# stdin: AgentWebhookBody + { "prompt": "..." }
# stdout: TuiManifest JSON
TUI_BRIDGE_DRIVER=exec \
TUI_BRIDGE_COMMAND='node packages/tui-agent-bridge/examples/enrich-echo.mjs' \
npm run bridge
```

### `forward` contract

```bash
TUI_BRIDGE_DRIVER=forward \
TUI_BRIDGE_FORWARD_URL=http://127.0.0.1:9100/enrich \
TUI_BRIDGE_FORWARD_MODE=sync \
npm run bridge
```

**Even simpler:** point `TUI_AGENT_WEBHOOK_URL` at your own HTTP agent — skip this daemon, as long as it honors the webhook schema + callback.

## Run

```bash
./vae --no-tui                 # backend + daemon
# or alone:
export TUI_AGENT_WEBHOOK_URL=http://127.0.0.1:9090/agent
npm run bridge
TUI_SESSION_ID=demo npm run dev:tui
```

Detail → `i` → `/details` → Enter → overlay until callback.

## Env

| Variable | Default |
|----------|---------|
| `TUI_BRIDGE_HOST` / `PORT` / `PATH` | `127.0.0.1` / `9090` / `/agent` |
| `TUI_BRIDGE_DRIVER` | `auto` (`sdk` if `CURSOR_API_KEY`, else `stub`) |
| `TUI_BRIDGE_COMMAND` | — (`exec` only when set) |
| `TUI_BRIDGE_FORWARD_URL` | — (`forward`) |
| `TUI_BRIDGE_FORWARD_MODE` | `sync` |
| `TUI_BRIDGE_TIMEOUT_MS` | `120000` |
| `TUI_AGENT_WEBHOOK_TOKEN` | — Bearer (optional) |
| `CURSOR_API_KEY` | — (`sdk`) |
| `VISUAL_ENGINE_API_KEY` | — callback `X-API-Key` |
