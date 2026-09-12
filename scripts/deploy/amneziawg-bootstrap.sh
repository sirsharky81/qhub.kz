#!/bin/bash
# Install AmneziaWG 2.0 alongside QHub WireGuard (wg0). For Russia / DPI networks.
# Idempotent — safe to re-run after reboot. Run as root on VPS.
set -euo pipefail

INSTALLER_VER="${AMNEZIAWG_INSTALLER_VER:-v5.29.0}"
AWG_PORT="${AMNEZIAWG_PORT:-443}"
AWG_ENDPOINT="${AMNEZIAWG_ENDPOINT:-}"
APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
ENV_FILE="${APP_DIR}/.env.production"
INSTALLER="/tmp/install_amneziawg_en.sh"

ensure_web_firewall() {
  if ! command -v ufw >/dev/null 2>&1; then
    return 0
  fi
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw allow 443/udp >/dev/null 2>&1 || true
  ufw allow 51820/udp >/dev/null 2>&1 || true
  ufw allow "${AWG_PORT}/udp" >/dev/null 2>&1 || true
  ufw reload >/dev/null 2>&1 || true
}

write_env_flags() {
  local port="$1"
  [ -f "$ENV_FILE" ] || return 0
  local amnezia_cmd="${APP_DIR}/scripts/vpn/amnezia-client.sh"
  grep -q '^AMNEZIAWG_ENABLED=' "$ENV_FILE" \
    && sed -i 's|^AMNEZIAWG_ENABLED=.*|AMNEZIAWG_ENABLED=1|' "$ENV_FILE" \
    || echo 'AMNEZIAWG_ENABLED=1' >> "$ENV_FILE"
  grep -q '^AMNEZIAWG_PORT=' "$ENV_FILE" \
    && sed -i "s|^AMNEZIAWG_PORT=.*|AMNEZIAWG_PORT=${port}|" "$ENV_FILE" \
    || echo "AMNEZIAWG_PORT=${port}" >> "$ENV_FILE"
  grep -q '^AMNEZIAWG_ENDPOINT=' "$ENV_FILE" \
    && sed -i "s|^AMNEZIAWG_ENDPOINT=.*|AMNEZIAWG_ENDPOINT=${AWG_ENDPOINT}:${port}|" "$ENV_FILE" \
    || echo "AMNEZIAWG_ENDPOINT=${AWG_ENDPOINT}:${port}" >> "$ENV_FILE"
  grep -q '^AMNEZIAWG_COMMAND=' "$ENV_FILE" \
    && sed -i "s|^AMNEZIAWG_COMMAND=.*|AMNEZIAWG_COMMAND=${amnezia_cmd}|" "$ENV_FILE" \
    || echo "AMNEZIAWG_COMMAND=${amnezia_cmd}" >> "$ENV_FILE"
  chmod +x "$amnezia_cmd" 2>/dev/null || true
  SUDOERS_FILE="/etc/sudoers.d/qhub-amnezia"
  cat > "$SUDOERS_FILE" <<EOF
# Allow PM2 / deploy user to manage AmneziaWG clients without password
ALL ALL=(root) NOPASSWD: ${amnezia_cmd}
EOF
  chmod 440 "$SUDOERS_FILE"
}

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

echo "[amnezia] QHub AmneziaWG bootstrap (port UDP ${AWG_PORT})"

if [ -z "$AWG_ENDPOINT" ]; then
  if [ -f "$ENV_FILE" ]; then
    line="$(grep -E '^VPN_SERVER_ENDPOINT=' "$ENV_FILE" 2>/dev/null | head -1 || true)"
    if [ -n "$line" ]; then
      AWG_ENDPOINT="${line#*=}"
      AWG_ENDPOINT="${AWG_ENDPOINT%%:*}"
      AWG_ENDPOINT="${AWG_ENDPOINT//\"/}"
      AWG_ENDPOINT="${AWG_ENDPOINT//\'/}"
    fi
  fi
  AWG_ENDPOINT="${AWG_ENDPOINT:-$(curl -4 -fsS https://ifconfig.me 2>/dev/null || echo 65.108.215.248)}"
fi

if awg show awg0 >/dev/null 2>&1; then
  live_port="$(awg show awg0 | awk '/listening port:/ {print $3}')"
  echo "[amnezia] awg0 already up — UDP ${live_port:-?}"
  ensure_web_firewall
  write_env_flags "${live_port:-$AWG_PORT}"
  exit 0
fi

if [ ! -f "$INSTALLER" ]; then
  wget -q -O "$INSTALLER" \
    "https://raw.githubusercontent.com/bivlked/amneziawg-installer/${INSTALLER_VER}/install_amneziawg_en.sh"
  chmod +x "$INSTALLER"
fi

echo "[amnezia] running installer (mobile preset, full tunnel, endpoint ${AWG_ENDPOINT})"
echo "[amnezia] NOTE: installer may request reboot — re-run this script after reboot"

set +e
bash "$INSTALLER" \
  --yes \
  --route-all \
  --preset=mobile \
  --port="$AWG_PORT" \
  --endpoint="$AWG_ENDPOINT" \
  --disallow-ipv6
install_rc=$?
set -e

ensure_web_firewall

if awg show awg0 >/dev/null 2>&1; then
  live_port="$(awg show awg0 | awk '/listening port:/ {print $3}')"
  write_env_flags "${live_port:-$AWG_PORT}"
  echo "[amnezia] OK — awg0 listening UDP ${live_port}"
  echo "[amnezia] Add client: bash ${APP_DIR}/scripts/vpn/amnezia-client.sh add <name>"
  exit 0
fi

if [ "$install_rc" -ne 0 ]; then
  echo "[amnezia] installer exit ${install_rc} — if kernel module was built, reboot and re-run:" >&2
  echo "  sudo bash ${APP_DIR}/scripts/deploy/amneziawg-bootstrap.sh" >&2
  exit "$install_rc"
fi

echo "[amnezia] awg0 not up yet — reboot may be required" >&2
exit 1
