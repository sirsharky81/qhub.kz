#!/bin/bash
# Sync Redis VPN peers → WireGuard. Re-execs as root via sudo when needed.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
WG_DIR="/etc/wireguard"

if [ ! -w "$WG_DIR" ] && [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@"
fi

cd "$APP_DIR"
exec node --env-file="$APP_DIR/.env.production" "$APP_DIR/scripts/vpn/wg-sync.mjs"
