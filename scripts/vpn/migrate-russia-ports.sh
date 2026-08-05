#!/bin/bash
# Free UDP 443 for AmneziaWG (Russia mobile carriers) and move WireGuard to 51820.
# Run on VPS as root after AmneziaWG is installed.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
cd "$APP_DIR"

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

chmod +x scripts/vpn/migrate-listen-port.sh scripts/vpn/migrate-amnezia-port.sh 2>/dev/null || true

if ! awg show awg0 >/dev/null 2>&1; then
  echo "[russia-ports] awg0 not running — keeping WireGuard on UDP 443 if configured"
  if command -v wg >/dev/null 2>&1 && wg show wg0 >/dev/null 2>&1; then
    VPN_LISTEN_PORT=443 bash scripts/vpn/migrate-listen-port.sh || true
  fi
  exit 0
fi

AWG_PORT="$(awg show awg0 | awk '/listening port:/ {print $3}')"
if [ "$AWG_PORT" = "443" ]; then
  echo "[russia-ports] AmneziaWG already on UDP 443"
  exit 0
fi

echo "[russia-ports] AmneziaWG on UDP ${AWG_PORT} — moving to 443 for Russian mobile networks"

if command -v wg >/dev/null 2>&1 && wg show wg0 >/dev/null 2>&1; then
  WG_PORT="$(wg show wg0 | awk '/listening port:/ {print $3}')"
  if [ "$WG_PORT" = "443" ]; then
    echo "[russia-ports] moving WireGuard wg0 UDP 443 -> 51820"
    VPN_LISTEN_PORT=51820 bash scripts/vpn/migrate-listen-port.sh
  fi
fi

AMNEZIAWG_PORT=443 bash scripts/vpn/migrate-amnezia-port.sh
echo "[russia-ports] done — Amnezia UDP 443, WireGuard UDP 51820 (if wg0 up)"
