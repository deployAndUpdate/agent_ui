#!/usr/bin/env bash
# Claude Code wrapper for TUI_BRIDGE_DRIVER=exec.
set -euo pipefail
EX="$(cd "$(dirname "$0")" && pwd)"
if [[ -n "${TUI_ENRICH_BODY_FILE:-}" && -f "$TUI_ENRICH_BODY_FILE" ]]; then
  BODY="$(cat "$TUI_ENRICH_BODY_FILE")"
else
  BODY="$(cat)"
fi
PROMPT="$(printf '%s' "$BODY" | node "$EX/prompt-from-webhook.mjs")"

if ! command -v claude >/dev/null 2>&1; then
  printf '%s' "$BODY" | node "$EX/enrich-echo.mjs"
  exit 0
fi

OUT="$(claude -p "$PROMPT" --output-format text 2>/dev/null || true)"
if [[ -z "${OUT// }" ]]; then
  printf '%s' "$BODY" | node "$EX/enrich-echo.mjs"
  exit 0
fi
printf '%s' "$OUT"
