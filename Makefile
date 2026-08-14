#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

case "${1:-}" in
  setup) exec "$ROOT/install" ;;
  start|up) shift || true; exec "$ROOT/vae" "$@" ;;
  stop) exec "$ROOT/vae" stop ;;
  smoke) exec "$ROOT/vae" smoke ;;
  test)
    npm test
    cargo test --manifest-path tui/Cargo.toml
    ;;
  *)
    echo "make setup | start | stop | smoke | test" >&2
    exit 1
    ;;
esac
