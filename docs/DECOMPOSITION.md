# Decomposition — Visual Agent Engine (TUI-only)

| # | Module | Goal | Status |
|---|--------|------|--------|
| 7 | TUI track (schema + backend + Ratatui) | [goals/07-tui-ratatui.md](./goals/07-tui-ratatui.md) | done |

Historical web goals (01–06) referred to the React track and are out of active scope. Scratch notes may live under local `docs/dev/` (gitignored).

## Layout

```
visual_engine/
├── docs/                 # committed English product docs
├── packages/
│   ├── tui-shared/       # JSON Schema + AJV
│   └── cli/              # visual-agent submit (TUI)
├── backend/              # TUI API + outbox + WS
│   └── src/tui/
└── tui/                  # Ratatui client
```
