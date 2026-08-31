#!/bin/bash
# Repair AmneziaWG for Russia: Redis, forwarding, installer upgrade, UDP 443, regen clients.
# Use when VPN shows «Подключено» but WhatsApp/sites don't work (DPI / stale obfuscation).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
ENV_FILE="${APP_DIR}/.env.production"
INSTALLER_VER="${AMNEZIAWG_INSTALLER_VER:-v5.29.0}"
INSTALLER="/tmp/install_amneziawg_en.sh"
MANAGE="/root/awg/manage_amneziawg.sh"
AWG_CONF="/etc/amnezia/amneziawg/awg0.conf"

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

cd "$APP_DIR"

echo "[amnezia-repair] start"

echo "[amnezia-repair] Redis"
if [ -x scripts/deploy/repair-redis.sh ]; then
  bash scripts/deploy/repair-redis.sh || echo "[amnezia-repair] warn: redis repair failed" >&2
fi

echo "[amnezia-repair] ip_forward"
sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true
grep -q '^net.ipv4.ip_forward' /etc/sysctl.conf 2>/dev/null \
  || echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.conf

AWG_ENDPOINT=""
if [ -f "$ENV_FILE" ]; then
  line="$(grep -E '^AMNEZIAWG_ENDPOINT=' "$ENV_FILE" 2>/dev/null | head -1 || true)"
  if [ -n "$line" ]; then
    AWG_ENDPOINT="${line#*=}"
    AWG_ENDPOINT="${AWG_ENDPOINT%%:*}"
    AWG_ENDPOINT="${AWG_ENDPOINT//\"/}"
  fi
  if [ -z "$AWG_ENDPOINT" ]; then
    line="$(grep -E '^VPN_SERVER_ENDPOINT=' "$ENV_FILE" 2>/dev/null | head -1 || true)"
    [ -n "$line" ] && AWG_ENDPOINT="${line#*=}" && AWG_ENDPOINT="${AWG_ENDPOINT%%:*}"
  fi
fi
AWG_ENDPOINT="${AWG_ENDPOINT:-$(curl -4 -fsS https://ifconfig.me 2>/dev/null || echo 65.108.215.248)}"

if ! command -v awg >/dev/null 2>&1; then
  echo "[amnezia-repair] awg missing — running bootstrap"
  bash scripts/deploy/amneziawg-bootstrap.sh
else
  chmod +x scripts/vpn/migrate-russia-ports.sh scripts/vpn/migrate-amnezia-port.sh 2>/dev/null || true
  if wg show wg0 >/dev/null 2>&1; then
    WG_PORT="$(wg show wg0 | awk '/listening port:/ {print $3}')"
    if [ "$WG_PORT" = "443" ]; then
      echo "[amnezia-repair] WireGuard on UDP 443 — moving to 51820 for Amnezia"
      VPN_LISTEN_PORT=51820 bash scripts/vpn/migrate-listen-port.sh || true
    fi
  fi

  echo "[amnezia-repair] upgrade installer ${INSTALLER_VER} (mobile preset, Jmax fix for RU carriers)"
  wget -q -O "$INSTALLER" \
    "https://raw.githubusercontent.com/bivlked/amneziawg-installer/${INSTALLER_VER}/install_amneziawg_en.sh"
  chmod +x "$INSTALLER"

  set +e
  AWG_FORCE_REINSTALL=1 bash "$INSTALLER" \
    --yes \
    --force \
    --route-all \
    --preset=mobile \
    --port=443 \
    --endpoint="$AWG_ENDPOINT" \
    --disallow-ipv6
  install_rc=$?
  set -e
  if [ "$install_rc" -ne 0 ]; then
    echo "[amnezia-repair] installer exit ${install_rc} — trying awg0 restart" >&2
    systemctl restart awg-quick@awg0 2>/dev/null || awg-quick up awg0 2>/dev/null || true
  fi
fi

if awg show awg0 >/dev/null 2>&1; then
  bash scripts/vpn/migrate-russia-ports.sh || AMNEZIAWG_PORT=443 bash scripts/vpn/migrate-amnezia-port.sh || true
else
  echo "[amnezia-repair] ERROR: awg0 still down" >&2
  bash scripts/deploy/amneziawg-bootstrap.sh || true
fi

if [ -x "$MANAGE" ] && awg show awg0 >/dev/null 2>&1; then
  echo "[amnezia-repair] regen all client configs from live awg0.conf"
  mapfile -t clients < <(
    bash "$MANAGE" list 2>/dev/null | awk -F'|' '
      NR > 2 && $0 !~ /^-/ {
        gsub(/^[ \t]+|[ \t]+$/, "", $1)
        if ($1 != "" && $1 !~ /Client name/) print $1
      }'
  )
  for name in "${clients[@]}"; do
    [ -z "$name" ] && continue
    bash "$MANAGE" regen "$name" --yes >&2 || echo "[amnezia-repair] warn: regen ${name}" >&2
  done
  echo "[amnezia-repair] regen done (${#clients[@]} clients)"
fi

echo "[amnezia-repair] diagnostics"
if awg show awg0 >/dev/null 2>&1; then
  awg show awg0 | awk '/listening port:/ {print "awg0 UDP port:", $3}'
  awg show awg0 | awk '/peer:/ {print}' | wc -l | awk '{print "peers:", $1}'
else
  echo "awg0: DOWN"
fi
[ -f "$AWG_CONF" ] && grep -E '^(Jc|Jmin|Jmax|ListenPort)' "$AWG_CONF" 2>/dev/null | head -6 || true
sysctl net.ipv4.ip_forward 2>/dev/null || true
if command -v ufw >/dev/null 2>&1; then
  ufw status 2>/dev/null | grep -E '443|51820' || true
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart qhub 2>/dev/null || true
fi

echo "[amnezia-repair] done — re-import QR/vpn:// from portal (old profile may have stale obfuscation)"
