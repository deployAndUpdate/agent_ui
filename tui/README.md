# vae-tui (Ratatui)

```bash
./install                 # builds release binary
./vae --demo              # backend + agent daemon + hello manifest + TUI
# or
cargo install --path tui  # installs `vae-tui` to cargo bin
```

Env: `TUI_SESSION_ID`, `TUI_WS_URL` — see `.env.example`.

Keys: `i` browse (board or detail) · `p` prompt (root board or detail) · `Enter` open row (auto `/details`, then cached) · Tab focus · `Esc` back · `q` quit.
