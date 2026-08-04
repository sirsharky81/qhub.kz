#!/bin/bash
# Switch WireGuard listen port (default UDP 443). Updates .env.production and reloads wg0.
# Run on VPS as root or via sudo: bash scripts/vpn/migrate-listen-port.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
ENV_FILE="${APP_DIR}/.env.production"
NEW_PORT="${VPN_LISTEN_PORT:-443}"

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

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

PUBLIC_IP="${VPN_PUBLIC_IP:-}"
if [ -z "$PUBLIC_IP" ] && [ -n "${VPN_SERVER_ENDPOINT:-}" ]; then
  PUBLIC_IP="${VPN_SERVER_ENDPOINT%%:*}"
fi
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP=$(curl -4 -fsS https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
fi

OLD_PORT="${VPN_LISTEN_PORT:-51820}"
if [ "$OLD_PORT" = "$NEW_PORT" ] && grep -q ":${NEW_PORT}\$" <<<"${VPN_SERVER_ENDPOINT:-}"; then
  echo "[vpn-port] already on UDP ${NEW_PORT}, skip"
  exit 0
fi

echo "[vpn-port] switching WireGuard ${OLD_PORT} -> ${NEW_PORT} (${PUBLIC_IP})"

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

chmod +x scripts/vpn/run-wg-sync.sh 2>/dev/null || true
if [ -x scripts/vpn/run-wg-sync.sh ]; then
  VPN_LISTEN_PORT="$NEW_PORT" bash scripts/vpn/run-wg-sync.sh
else
  VPN_LISTEN_PORT="$NEW_PORT" node --env-file="$ENV_FILE" scripts/vpn/wg-sync.mjs
fi

echo "[vpn-port] done — client Endpoint: ${PUBLIC_IP}:${NEW_PORT}"
echo "[vpn-port] Hetzner Cloud Firewall: allow UDP ${NEW_PORT} (if not yet)"
