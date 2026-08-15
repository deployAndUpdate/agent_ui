# vae-tui (Ratatui)

```bash
./install                 # builds release binary
./vae --demo              # backend + agent daemon + hello manifest + TUI
# or
cargo install --path tui  # installs `vae-tui` to cargo bin
```

Env: `TUI_SESSION_ID`, `TUI_WS_URL` — see `.env.example`.

Keys: `i` browse · `Enter` open row (auto `/details`) · Tab focus · `p` prompt · `Esc` back · `q` quit.
