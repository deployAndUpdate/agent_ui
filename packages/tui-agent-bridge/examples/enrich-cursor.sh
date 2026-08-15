#!/usr/bin/env bash
# Cursor Agent CLI wrapper for TUI_BRIDGE_DRIVER=exec (stdin JSON → stdout TuiManifest).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
EX="$(cd "$(dirname "$0")" && pwd)"
if [[ -n "${TUI_ENRICH_BODY_FILE:-}" && -f "$TUI_ENRICH_BODY_FILE" ]]; then
  BODY="$(cat "$TUI_ENRICH_BODY_FILE")"
else
  BODY="$(cat)"
fi
PROMPT="$(printf '%s' "$BODY" | node "$EX/prompt-from-webhook.mjs")"

BIN="${TUI_BRIDGE_AGENT_BIN:-agent}"
if ! command -v "$BIN" >/dev/null 2>&1; then
  printf '%s' "$BODY" | node "$EX/enrich-echo.mjs"
  exit 0
fi

OUT="$("$BIN" --print --mode ask --trust --workspace "$ROOT" --output-format text "$PROMPT" 2>/dev/null || true)"
if [[ -z "${OUT// }" ]]; then
  printf '%s' "$BODY" | node "$EX/enrich-echo.mjs"
  exit 0
fi
printf '%s' "$OUT"
