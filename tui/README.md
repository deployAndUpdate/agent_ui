# vae-tui (Ratatui)

```bash
./install                 # builds release binary
./vae --demo              # backend + hello manifest + TUI
# or
cargo install --path tui  # installs `vae-tui` to cargo bin
```

Env: `TUI_SESSION_ID`, `TUI_WS_URL` — see `.env.example`.

Keys: `i` browse · `Enter` open Table · `Esc` back · `Tab`/`[` `]` focus · `↑`/`↓`/`j`/`k` (idle: widget scroll; browse: page; table: row) · `PgUp`/`PgDn` page · `q` quit.
