# Visual Agent Engine

Server-Driven **TUI**: agent → JSON `TuiManifest` → AJV → outbox → WebSocket → **Ratatui**.

This is an orchestrator plus a terminal browser. There is no LLM inside.

[![CI](https://img.shields.io/badge/CI-github%20actions-blue)](.github/workflows/ci.yml)

## Requirements

- Node.js ≥ 20
- Rust stable (`cargo`)
- UTF-8 terminal, recommended ≥ 80×24
- Linux / macOS / WSL2

## Quick start (utility)

```bash
git clone <repo> && cd visual_engine
./install
./vae --demo
```

Stop the backend with `./vae stop`.

Push a manifest:

```bash
npm run agent -- submit --session demo --file examples/hello.tui.json
# aliases: visual-agent / vae-agent (after npm link -w @visual-engine/cli)
```

Smoke without TUI:

```bash
./vae smoke
```

## Docker (backend)

```bash
# in-memory
API_KEYS=dev-key docker compose up --build backend

# Postgres
API_KEYS=secret docker compose --profile with-db up --build
```

Always run the TUI on the host (needs a TTY):

```bash
TUI_SESSION_ID=demo npm run dev:tui
# or: cargo install --path tui   → vae-tui
```

## Env

See [`.env.example`](.env.example). With `NODE_ENV=production`, `API_KEYS` is required (or set `AUTH_ENABLED=false` explicitly).

## Docs

- [Technical spec](docs/TECHNICAL_SPEC.md)
- [Prod checklist](docs/PROD.md)
- Skill: `.cursor/skills/visual-agent-engine/`

Local/scratch notes (may be non-English) live under `docs/dev/` and are **not** committed.

## Packages

| Path | Role |
|------|------|
| `packages/tui-shared` | JSON Schema + AJV |
| `packages/cli` | `visual-agent` / `vae-agent` submit |
| `backend` | HTTP + WS + outbox |
| `tui/` | Ratatui client (`vae-tui`) |

## Examples
Agent terminal with prompt (Cursor AI example) :
<img width="862" height="516" alt="image" src="https://github.com/user-attachments/assets/536f606c-87f4-454e-8d91-cdb15fac411f" />
Visual engine terminal :
<img width="1920" height="1200" alt="image" src="https://github.com/user-attachments/assets/75c2d4ef-8fed-479a-9564-48014feccacf" />



## License

MIT — see [LICENSE](LICENSE).
