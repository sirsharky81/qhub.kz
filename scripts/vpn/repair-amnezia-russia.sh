#!/bin/bash
# Repair AmneziaWG for Russia: Redis, forwarding, regen clients, optional installer upgrade.
# Default: safe regen (no reboot). Set AWG_FORCE_UPGRADE=1 for full installer --force.
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

regen_all_clients() {
  if [ ! -x "$APP_DIR/scripts/vpn/amnezia-client.sh" ] || ! awg show awg0 >/dev/null 2>&1; then
    return 0
  fi
  echo "[amnezia-repair] regen all clients"
  bash "$APP_DIR/scripts/vpn/amnezia-client.sh" regen-all || true
}

if ! command -v awg >/dev/null 2>&1 || ! awg show awg0 >/dev/null 2>&1; then
  echo "[amnezia-repair] awg0 down — bootstrap (may need second run after reboot)"
  bash scripts/deploy/amneziawg-bootstrap.sh || true
fi

chmod +x scripts/vpn/migrate-russia-ports.sh scripts/vpn/migrate-amnezia-port.sh 2>/dev/null || true
if awg show awg0 >/dev/null 2>&1; then
  bash scripts/vpn/migrate-russia-ports.sh || AMNEZIAWG_PORT=443 bash scripts/vpn/migrate-amnezia-port.sh || true
  systemctl restart awg-quick@awg0 2>/dev/null || awg-quick down awg0 2>/dev/null; awg-quick up awg0 2>/dev/null || true
fi

if [ "${AWG_FORCE_UPGRADE:-0}" = "1" ]; then
  echo "[amnezia-repair] AWG_FORCE_UPGRADE=1 — running installer ${INSTALLER_VER} (may reboot once)"
  if wg show wg0 >/dev/null 2>&1; then
    WG_PORT="$(wg show wg0 | awk '/listening port:/ {print $3}')"
    [ "$WG_PORT" = "443" ] && VPN_LISTEN_PORT=51820 bash scripts/vpn/migrate-listen-port.sh || true
  fi
  wget -q -O "$INSTALLER" \
    "https://raw.githubusercontent.com/bivlked/amneziawg-installer/${INSTALLER_VER}/install_amneziawg_en.sh"
  chmod +x "$INSTALLER"
  set +e
  AWG_FORCE_REINSTALL=1 bash "$INSTALLER" \
    --yes --force --route-all --preset=mobile --port=443 \
    --endpoint="$AWG_ENDPOINT" --disallow-ipv6
  install_rc=$?
  set -e
  if [ "$install_rc" -ne 0 ]; then
    echo "[amnezia-repair] installer exit ${install_rc} (reboot may be pending — re-run deploy)" >&2
    bash scripts/deploy/amneziawg-bootstrap.sh || true
  fi
else
  echo "[amnezia-repair] safe mode — regen only (set AWG_FORCE_UPGRADE=1 for full upgrade)"
fi

chmod +x scripts/vpn/apply-russia-hetzner-i1.sh scripts/vpn/generate-quic-i1.mjs 2>/dev/null || true
if [ -x scripts/vpn/apply-russia-hetzner-i1.sh ]; then
  bash scripts/vpn/apply-russia-hetzner-i1.sh || echo "[amnezia-repair] warn: hetzner I1 apply failed" >&2
fi

regen_all_clients

echo "[amnezia-repair] diagnostics"
if awg show awg0 >/dev/null 2>&1; then
  awg show awg0 | awk '/listening port:/ {print "awg0 UDP port:", $3}'
  awg show awg0 | awk '/peer:/ {print}' | wc -l | awk '{print "peers:", $1}'
else
  echo "awg0: DOWN — run deploy again or: sudo bash scripts/deploy/amneziawg-bootstrap.sh"
fi
[ -f "$AWG_CONF" ] && grep -E '^(Jc|Jmin|Jmax|ListenPort|I1)' "$AWG_CONF" 2>/dev/null | head -8 || true

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart qhub 2>/dev/null || true
fi

echo "[amnezia-repair] done — re-import QR/vpn:// from portal"
