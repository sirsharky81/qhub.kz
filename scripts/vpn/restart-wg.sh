#!/bin/bash
# Force-restart WireGuard (wg0). Falls back to UDP 51820 if current port fails.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
ENV_FILE="${APP_DIR}/.env.production"
WG_INTERFACE="${VPN_INTERFACE:-wg0}"

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

cd "$APP_DIR"

env_val() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 || true)"
  [ -z "$line" ] && return 0
  local val="${line#*=}"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  case "$val" in
    \"*\") val="${val#\"}"; val="${val%\"}" ;;
    \'*\') val="${val#\'}"; val="${val%\'}" ;;
  esac
  printf '%s' "$val"
}

force_down_wg() {
  systemctl stop "wg-quick@${WG_INTERFACE}" 2>/dev/null || true
  wg-quick down "$WG_INTERFACE" 2>/dev/null || true
  ip link del "$WG_INTERFACE" 2>/dev/null || true
  ip link delete "$WG_INTERFACE" 2>/dev/null || true
  sleep 1
}

try_sync() {
  export VPN_LISTEN_PORT="$1"
  chmod +x scripts/vpn/run-wg-sync.sh 2>/dev/null || true
  if [ -x scripts/vpn/run-wg-sync.sh ]; then
    bash scripts/vpn/run-wg-sync.sh
  else
    node --env-file="$ENV_FILE" scripts/vpn/wg-sync.mjs
  fi
  wg show "$WG_INTERFACE" | grep -q "listening port: $1"
}

set_env_port() {
  local port="$1"
  local ip
  ip="$(env_val VPN_SERVER_ENDPOINT)"
  ip="${ip%%:*}"
  [ -z "$ip" ] && ip="$(curl -4 -fsS https://ifconfig.me 2>/dev/null || echo 65.108.215.248)"
  if grep -q '^VPN_LISTEN_PORT=' "$ENV_FILE"; then
    sed -i "s|^VPN_LISTEN_PORT=.*|VPN_LISTEN_PORT=${port}|" "$ENV_FILE"
  else
    echo "VPN_LISTEN_PORT=${port}" >> "$ENV_FILE"
  fi
  if grep -q '^VPN_SERVER_ENDPOINT=' "$ENV_FILE"; then
    sed -i "s|^VPN_SERVER_ENDPOINT=.*|VPN_SERVER_ENDPOINT=${ip}:${port}|" "$ENV_FILE"
  else
    echo "VPN_SERVER_ENDPOINT=${ip}:${port}" >> "$ENV_FILE"
  fi
  command -v ufw >/dev/null 2>&1 && ufw allow "${port}/udp" || true
}

if [ ! -f "$ENV_FILE" ] || ! command -v wg >/dev/null 2>&1; then
  echo "[vpn-restart] skip — no env or wg"
  exit 0
fi

TARGET_PORT="$(env_val VPN_LISTEN_PORT)"
TARGET_PORT="${TARGET_PORT:-51820}"

echo "[vpn-restart] force down ${WG_INTERFACE}"
force_down_wg

echo "[vpn-restart] try UDP ${TARGET_PORT}"
if try_sync "$TARGET_PORT" 2>/dev/null; then
  echo "[vpn-restart] ok — listening UDP ${TARGET_PORT}"
  exit 0
fi

echo "[vpn-restart] failed on ${TARGET_PORT}, fallback UDP 51820"
force_down_wg
set_env_port 51820
try_sync 51820
echo "[vpn-restart] ok — listening UDP 51820 (clients: Endpoint :51820)"
pm2 restart qhub 2>/dev/null || true
