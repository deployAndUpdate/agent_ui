# Testing pyramid (TUI-only)

| Layer | What | Where |
|-------|------|-------|
| Unit | AJV TUI schema, CLI heal | `packages/tui-shared`, `packages/cli` |
| Integration | HTTP + WS outbox | `backend/tests/integration/tui.test.ts` |
| Manual | Ratatui client | `npm run dev:tui` / `./vae` |

```bash
npm test -w @visual-engine/tui-shared
npm test -w backend
npm test -w @visual-engine/cli
cargo test --manifest-path tui/Cargo.toml
./vae smoke
```
