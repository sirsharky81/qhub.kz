#!/bin/bash
# Switch AmneziaWG listen port (default UDP 443 — passes Russian mobile DPI better than 3355).
# Run on VPS as root: bash scripts/vpn/migrate-amnezia-port.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
ENV_FILE="${APP_DIR}/.env.production"
NEW_PORT="${AMNEZIAWG_PORT:-443}"
AWG_CONF="/etc/amnezia/amneziawg/awg0.conf"
AWG_CFG="/root/awg/awgsetup_cfg.init"
MANAGE="/root/awg/manage_amneziawg.sh"

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

if ! command -v awg >/dev/null 2>&1; then
  echo "[amnezia-port] awg not installed, skip"
  exit 0
fi

if ! awg show awg0 >/dev/null 2>&1; then
  echo "[amnezia-port] awg0 not running, skip"
  exit 0
fi

LIVE_PORT="$(awg show awg0 | awk '/listening port:/ {print $3}')"
if [ "$LIVE_PORT" = "$NEW_PORT" ]; then
  echo "[amnezia-port] already on UDP ${NEW_PORT}, skip"
  exit 0
fi

if wg show wg0 >/dev/null 2>&1; then
  WG_PORT="$(wg show wg0 | awk '/listening port:/ {print $3}')"
  if [ "$WG_PORT" = "$NEW_PORT" ]; then
    echo "[amnezia-port] WireGuard wg0 holds UDP ${NEW_PORT} — run VPN_LISTEN_PORT=51820 migrate-listen-port.sh first" >&2
    exit 1
  fi
fi

echo "[amnezia-port] switching AmneziaWG UDP ${LIVE_PORT:-?} -> ${NEW_PORT}"

systemctl stop awg-quick@awg0 2>/dev/null || awg-quick down awg0 2>/dev/null || true

if [ -f "$AWG_CONF" ]; then
  if grep -q '^ListenPort' "$AWG_CONF"; then
    sed -i "s/^ListenPort = .*/ListenPort = ${NEW_PORT}/" "$AWG_CONF"
  else
    sed -i "/^\[Interface\]/a ListenPort = ${NEW_PORT}" "$AWG_CONF"
  fi
fi

if [ -f "$AWG_CFG" ]; then
  if grep -q '^export AWG_PORT=' "$AWG_CFG"; then
    sed -i "s/^export AWG_PORT=.*/export AWG_PORT=${NEW_PORT}/" "$AWG_CFG"
  else
    echo "export AWG_PORT=${NEW_PORT}" >> "$AWG_CFG"
  fi
fi

if command -v ufw >/dev/null 2>&1; then
  [ -n "${LIVE_PORT:-}" ] && ufw delete allow "${LIVE_PORT}/udp" >/dev/null 2>&1 || true
  ufw allow "${NEW_PORT}/udp" >/dev/null 2>&1 || true
fi

if systemctl start awg-quick@awg0 2>/dev/null; then
  :
elif awg-quick up awg0 2>/dev/null; then
  :
else
  echo "[amnezia-port] ERROR: failed to start awg0" >&2
  exit 1
fi

sleep 1
LIVE_AFTER="$(awg show awg0 | awk '/listening port:/ {print $3}')"
if [ "$LIVE_AFTER" != "$NEW_PORT" ]; then
  echo "[amnezia-port] ERROR: awg0 listens on ${LIVE_AFTER:-?}, expected ${NEW_PORT}" >&2
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  PUBLIC_IP=""
  line="$(grep -E '^AMNEZIAWG_ENDPOINT=' "$ENV_FILE" 2>/dev/null | head -1 || true)"
  if [ -n "$line" ]; then
    PUBLIC_IP="${line#*=}"
    PUBLIC_IP="${PUBLIC_IP%%:*}"
    PUBLIC_IP="${PUBLIC_IP//\"/}"
  fi
  if [ -z "$PUBLIC_IP" ]; then
    line="$(grep -E '^VPN_SERVER_ENDPOINT=' "$ENV_FILE" 2>/dev/null | head -1 || true)"
    [ -n "$line" ] && PUBLIC_IP="${line#*=}" && PUBLIC_IP="${PUBLIC_IP%%:*}"
  fi
  PUBLIC_IP="${PUBLIC_IP:-65.108.215.248}"
  grep -q '^AMNEZIAWG_PORT=' "$ENV_FILE" \
    && sed -i "s|^AMNEZIAWG_PORT=.*|AMNEZIAWG_PORT=${NEW_PORT}|" "$ENV_FILE" \
    || echo "AMNEZIAWG_PORT=${NEW_PORT}" >> "$ENV_FILE"
  grep -q '^AMNEZIAWG_ENDPOINT=' "$ENV_FILE" \
    && sed -i "s|^AMNEZIAWG_ENDPOINT=.*|AMNEZIAWG_ENDPOINT=${PUBLIC_IP}:${NEW_PORT}|" "$ENV_FILE" \
    || echo "AMNEZIAWG_ENDPOINT=${PUBLIC_IP}:${NEW_PORT}" >> "$ENV_FILE"
fi

if [ -x "$MANAGE" ]; then
  echo "[amnezia-port] regenerating all AmneziaWG client configs (new Endpoint port)..."
  if [ -x "${APP_DIR}/scripts/vpn/amnezia-client.sh" ]; then
    bash "${APP_DIR}/scripts/vpn/amnezia-client.sh" regen-all || true
  else
    mapfile -t clients < <(
      bash "$MANAGE" list 2>/dev/null | awk -F'|' '
        NR > 2 && $0 !~ /^-/ {
          gsub(/^[ \t]+|[ \t]+$/, "", $1)
          if ($1 != "" && $1 !~ /Client name/) print $1
        }'
    )
    for name in "${clients[@]}"; do
      [ -z "$name" ] && continue
      bash "$MANAGE" regen "$name" --yes >&2 || echo "[amnezia-port] warn: regen failed for ${name}" >&2
    done
    echo "[amnezia-port] regen done (${#clients[@]} client(s))"
  fi
fi

echo "[amnezia-port] done — awg0 UDP ${LIVE_AFTER}. Re-import config in AmneziaVPN app."
