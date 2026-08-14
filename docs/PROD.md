# Production readiness (A–J)

Status of the packaging checklist.

| Area | Status | Notes |
|------|--------|-------|
| **A** One-command | done | `./install`, `./vae`, `./vae --demo`, `./vae smoke` |
| **B** Packaging | done | bins `vae-tui`, `visual-agent` / `vae-agent`; version `0.2.0` |
| **C** Backend service | done | `/health`, `/ready`, graceful SIGTERM/SIGINT, prod auth gate |
| **D** Data | done | memory default; Postgres via `DATABASE_URL` + `001_tui.sql` |
| **E** Docker | done | multi-stage Dockerfile, healthcheck, `with-db` profile |
| **F** Security | done | `.env.example`, sessionId charset, body 1mb, audit in CI |
| **G** Observability | done | structured logs + chunks count; smoke job in CI |
| **H** Agent DX | done | `examples/hello.tui.json`, skill TUI-only, CLI cwd-safe paths |
| **I** CI/CD | done | node+rust+smoke; release tags → GH binaries + GHCR image |
| **J** License | done | MIT; requirements in README |

## Ops notes

- Backup priority: `tui_sessions.last_manifest` (outbox is ephemeral fan-out).
- Idempotency: send `Idempotency-Key` on submit for safe retries.
- WS clients need a real TTY; do not expect Ratatui inside plain Docker without tty alloc.
