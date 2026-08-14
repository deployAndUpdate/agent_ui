# Goal 7: TUI track (only UI)

## Status

Web removed. TUI only: schema → backend → Ratatui.

## Done

- [x] `@visual-engine/tui-shared`
- [x] `backend/src/tui/` + `migrations/001_tui.sql`
- [x] `tui/` Ratatui browser
- [x] CLI submit → `/api/v1/tui/manifest`
- [x] Removed `frontend/`, `@visual-engine/shared`, web API/WS/store
- [x] Packaging: `./install`, `./vae`, Docker, CI (see [PROD.md](../PROD.md))

## Verify

```bash
./install
./vae smoke
./vae --demo
npm run agent -- submit --session demo --file examples/hello.tui.json
```
