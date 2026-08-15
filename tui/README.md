# vae-tui (Ratatui)

```bash
./install                 # builds release binary
./vae --demo              # backend + hello manifest + TUI
# or
cargo install --path tui  # installs `vae-tui` to cargo bin
```

Env: `TUI_SESSION_ID`, `TUI_WS_URL` — see `.env.example`.

Keys: `i` browse (idle) / cmd (detail) · `Enter` open · `Esc` back · `/details` enrich · `Tab` focus · `↑`/`↓`/`j`/`k` · `PgUp`/`PgDn` · `q` quit.
