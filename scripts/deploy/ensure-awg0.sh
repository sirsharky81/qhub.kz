#!/bin/bash
# Ensure AmneziaWG awg0 is enabled and running (survives reboot / failed deploy).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

if ! command -v awg >/dev/null 2>&1; then
  echo "[awg0] awg not installed — skip"
  exit 0
fi

if awg show awg0 >/dev/null 2>&1; then
  port="$(awg show awg0 | awk '/listening port:/ {print $3}')"
  echo "[awg0] already up — UDP ${port:-?}"
  exit 0
fi

echo "[awg0] interface down — starting awg-quick@awg0"
systemctl enable awg-quick@awg0 2>/dev/null || true
if systemctl start awg-quick@awg0 2>/dev/null; then
  sleep 1
elif awg-quick up awg0 2>/dev/null; then
  sleep 1
elif [ -x "${APP_DIR}/scripts/deploy/amneziawg-bootstrap.sh" ]; then
  echo "[awg0] bootstrap (installer may need second run after reboot)"
  bash "${APP_DIR}/scripts/deploy/amneziawg-bootstrap.sh" || true
else
  echo "[awg0] ERROR: could not start awg0" >&2
  exit 1
fi

if awg show awg0 >/dev/null 2>&1; then
  port="$(awg show awg0 | awk '/listening port:/ {print $3}')"
  echo "[awg0] OK — UDP ${port:-?}"
else
  echo "[awg0] still down after start attempt" >&2
  exit 1
fi
