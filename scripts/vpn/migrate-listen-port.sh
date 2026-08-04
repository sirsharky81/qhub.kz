#!/bin/bash
# Switch WireGuard listen port (default UDP 443). Updates .env.production and reloads wg0.
# Run on VPS as root or via sudo: bash scripts/vpn/migrate-listen-port.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
ENV_FILE="${APP_DIR}/.env.production"
NEW_PORT="${VPN_LISTEN_PORT:-443}"
WG_INTERFACE="${VPN_INTERFACE:-wg0}"

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

cd "$APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "[vpn-port] .env.production not found, skip"
  exit 0
fi

if ! command -v wg >/dev/null 2>&1; then
  echo "[vpn-port] WireGuard not installed, skip"
  exit 0
fi

env_val() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 || true)"
  if [ -z "$line" ]; then
    return 0
  fi
  local val="${line#*=}"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  case "$val" in
    \"*\") val="${val#\"}"; val="${val%\"}" ;;
    \'*\') val="${val#\'}"; val="${val%\'}" ;;
  esac
  printf '%s' "$val"
}

PUBLIC_IP="$(env_val VPN_PUBLIC_IP)"
ENDPOINT="$(env_val VPN_SERVER_ENDPOINT)"
if [ -z "$PUBLIC_IP" ] && [ -n "$ENDPOINT" ]; then
  PUBLIC_IP="${ENDPOINT%%:*}"
fi
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP=$(curl -4 -fsS https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
fi

CURRENT_PORT="${ENDPOINT##*:}"
if [ "$CURRENT_PORT" = "$ENDPOINT" ] || [ -z "$CURRENT_PORT" ]; then
  CURRENT_PORT="$(env_val VPN_LISTEN_PORT)"
  CURRENT_PORT="${CURRENT_PORT:-51820}"
fi

if wg show "$WG_INTERFACE" >/dev/null 2>&1; then
  LIVE_PORT="$(wg show "$WG_INTERFACE" | awk '/listening port:/ {print $3}')"
  if [ "$LIVE_PORT" = "$NEW_PORT" ] && [ "$CURRENT_PORT" = "$NEW_PORT" ]; then
    echo "[vpn-port] already on UDP ${NEW_PORT}, skip"
    exit 0
  fi
fi

echo "[vpn-port] switching WireGuard ${CURRENT_PORT:-?} -> ${NEW_PORT} (${PUBLIC_IP})"

if grep -q '^VPN_LISTEN_PORT=' "$ENV_FILE"; then
  sed -i "s|^VPN_LISTEN_PORT=.*|VPN_LISTEN_PORT=${NEW_PORT}|" "$ENV_FILE"
else
  echo "VPN_LISTEN_PORT=${NEW_PORT}" >> "$ENV_FILE"
fi

if grep -q '^VPN_SERVER_ENDPOINT=' "$ENV_FILE"; then
  sed -i "s|^VPN_SERVER_ENDPOINT=.*|VPN_SERVER_ENDPOINT=${PUBLIC_IP}:${NEW_PORT}|" "$ENV_FILE"
else
  echo "VPN_SERVER_ENDPOINT=${PUBLIC_IP}:${NEW_PORT}" >> "$ENV_FILE"
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow "${NEW_PORT}/udp" || true
fi

export VPN_LISTEN_PORT="$NEW_PORT"
chmod +x scripts/vpn/run-wg-sync.sh 2>/dev/null || true

sync_ok=0
if [ -x scripts/vpn/run-wg-sync.sh ]; then
  bash scripts/vpn/run-wg-sync.sh && sync_ok=1 || true
fi
if [ "$sync_ok" -eq 0 ]; then
  node --env-file="$ENV_FILE" scripts/vpn/wg-sync.mjs && sync_ok=1 || true
fi
if [ "$sync_ok" -eq 0 ] && command -v systemctl >/dev/null 2>&1; then
  systemctl restart "wg-quick@${WG_INTERFACE}" && sync_ok=1 || true
fi

if [ "$sync_ok" -eq 0 ]; then
  echo "[vpn-port] ERROR: could not reload WireGuard" >&2
  exit 1
fi

LIVE_PORT="$(wg show "$WG_INTERFACE" | awk '/listening port:/ {print $3}')"
echo "[vpn-port] done — listening UDP ${LIVE_PORT}, client Endpoint: ${PUBLIC_IP}:${NEW_PORT}"
