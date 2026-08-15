# TUI Agent Bridge (universal `/details` adapter)

Visual Engine does **not** care which LLM/agent you use. The universal contract is HTTP:

```
TUI /details
  → POST TUI_AGENT_WEBHOOK_URL   (schema: schemas/tui-agent-webhook.schema.json)
  → your agent / this bridge
  → POST callback.manifestUrl    { sessionId, manifest }  (taskId must be detail_*)
```

This package is an optional local receiver with pluggable drivers. Cursor / Claude Code / OpenCode are just backends behind `exec` or `forward`.

## Drivers

Default: **`exec`** + `examples/enrich-echo.mjs` (works without any LLM key).

| Driver | Use when | Config |
|--------|----------|--------|
| **`exec`** | Any CLI agent (default) | `TUI_BRIDGE_COMMAND` — stdin JSON → stdout TuiManifest |
| **`forward`** | Remote/other HTTP agent | `TUI_BRIDGE_FORWARD_URL` (+ `sync`/`async`) |
| `stub` | Inline template (no subprocess) | — |
| `cli` / `sdk` | Cursor-only convenience | `CURSOR_API_KEY` / `agent` login |

Swap the enricher without changing Visual Engine:

```bash
TUI_BRIDGE_COMMAND=bash packages/tui-agent-bridge/examples/enrich-claude.sh
TUI_BRIDGE_COMMAND=bash packages/tui-agent-bridge/examples/enrich-opencode.sh
TUI_BRIDGE_COMMAND=bash packages/tui-agent-bridge/examples/enrich-cursor.sh
```

### `exec` contract

```bash
# stdin: AgentWebhookBody + { "prompt": "..." }
# stdout: TuiManifest JSON
TUI_BRIDGE_DRIVER=exec \
TUI_BRIDGE_COMMAND='node packages/tui-agent-bridge/examples/enrich-echo.mjs' \
npm run bridge
```

Wire Claude / OpenCode the same way — wrap them so they print JSON only:

```bash
TUI_BRIDGE_COMMAND='claude -p "$(jq -r .prompt)" --output-format json | jq .manifest'
# or your opencode / custom wrapper
```

### `forward` contract

```bash
# sync: peer responds with TuiManifest body; bridge POSTs callback
TUI_BRIDGE_DRIVER=forward \
TUI_BRIDGE_FORWARD_URL=http://127.0.0.1:9100/enrich \
TUI_BRIDGE_FORWARD_MODE=sync \
npm run bridge

# async: peer returns 2xx and POSTs callback.manifestUrl itself
TUI_BRIDGE_FORWARD_MODE=async
```

**Even simpler:** point `TUI_AGENT_WEBHOOK_URL` straight at Claude/OpenCode/your server — skip this bridge entirely, as long as they honor the webhook schema + callback.

## Run

```bash
export TUI_AGENT_WEBHOOK_URL=http://127.0.0.1:9090/agent
npm run dev:backend          # terminal A
npm run bridge               # terminal B — pick driver via env
TUI_SESSION_ID=demo npm run dev:tui
```

Detail → `i` → `/details` → Enter → `waiting agent…` until callback.

## Env

| Variable | Default |
|----------|---------|
| `TUI_BRIDGE_HOST` / `PORT` / `PATH` | `127.0.0.1` / `9090` / `/agent` |
| `TUI_BRIDGE_DRIVER` | auto (`forward`\|`exec`\|`stub`) |
| `TUI_BRIDGE_COMMAND` | — (`exec`) |
| `TUI_BRIDGE_FORWARD_URL` | — (`forward`) |
| `TUI_BRIDGE_FORWARD_MODE` | `sync` |
| `TUI_BRIDGE_TIMEOUT_MS` | `120000` |
| `TUI_AGENT_WEBHOOK_TOKEN` | — Bearer (optional) |
| `CURSOR_API_KEY` | — (`cli`/`sdk`) |
| `VISUAL_ENGINE_API_KEY` | — callback `X-API-Key` |
