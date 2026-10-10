#!/bin/bash
# Refresh QUIC I1 when no AmneziaWG peer has handshaked recently (DPI / stale obfuscation).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
MAX_AGE_HOURS="${AWG_HANDSHAKE_MAX_AGE_HOURS:-48}"

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

if ! command -v awg >/dev/null 2>&1 || ! awg show awg0 >/dev/null 2>&1; then
  echo "[quic-rotate] awg0 down — skip"
  exit 0
fi

needs_rotate=0
while IFS= read -r line; do
  case "$line" in
    *"latest handshake:"*)
      if echo "$line" | grep -qE 'second|minute|hour'; then
        if echo "$line" | grep -q hour; then
          hrs="$(echo "$line" | grep -oE '[0-9]+ hour' | awk '{print $1}')"
          [ -n "$hrs" ] && [ "$hrs" -gt "$MAX_AGE_HOURS" ] && needs_rotate=1
        fi
        # seconds/minutes/hours within limit → healthy
        :
      else
        needs_rotate=1
      fi
      ;;
  esac
done < <(awg show awg0 2>/dev/null || true)

read -r peer_count handshake_lines <<< "$(awg show awg0 2>/dev/null | python3 - <<'PY'
import re, subprocess, sys
try:
    out = subprocess.check_output(["awg", "show", "awg0"], text=True, stderr=subprocess.DEVNULL)
except (subprocess.CalledProcessError, FileNotFoundError):
    print("0 0")
    sys.exit(0)
peers = len(re.findall(r"^peer:", out, re.M))
hs = len(re.findall(r"latest handshake:", out))
print(peers, hs)
PY
)"
peer_count="${peer_count:-0}"
handshake_lines="${handshake_lines:-0}"
echo "[quic-rotate] peers=${peer_count} handshake_lines=${handshake_lines}"

if [ "$peer_count" -gt 0 ] && [ "$handshake_lines" -eq 0 ]; then
  needs_rotate=1
  echo "[quic-rotate] no peer handshakes on record — will refresh I1"
fi

if [ "${AWG_ROTATE_QUIC_I1:-0}" = "1" ]; then
  needs_rotate=1
  echo "[quic-rotate] forced via AWG_ROTATE_QUIC_I1=1"
fi

if [ "$needs_rotate" -eq 0 ]; then
  echo "[quic-rotate] recent handshakes OK — skip I1 refresh"
  exit 0
fi

echo "[quic-rotate] refreshing QUIC I1 + regen clients"
export AWG_ROTATE_QUIC_I1=1
bash "${APP_DIR}/scripts/vpn/apply-russia-hetzner-i1.sh"
