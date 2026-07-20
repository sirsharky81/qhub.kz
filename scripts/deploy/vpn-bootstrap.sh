#!/bin/bash
# WireGuard VPN bootstrap for QHub VPS — run as root once
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
WG_INTERFACE="${VPN_INTERFACE:-wg0}"
WG_DIR="/etc/wireguard"
WG_CONF="${WG_DIR}/${WG_INTERFACE}.conf"
WG_PRIVATE="${WG_DIR}/${WG_INTERFACE}.server.key"
LISTEN_PORT="${VPN_LISTEN_PORT:-51820}"
PUBLIC_IP="${VPN_PUBLIC_IP:-}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq wireguard wireguard-tools

mkdir -p "$WG_DIR"
chmod 700 "$WG_DIR"

if [ ! -f "$WG_PRIVATE" ]; then
  umask 077
  wg genkey | tee "$WG_PRIVATE" | wg pubkey > "${WG_PRIVATE%.key}.pub"
fi

SERVER_PRIVATE=$(cat "$WG_PRIVATE")
SERVER_PUBLIC=$(cat "${WG_PRIVATE%.key}.pub")

if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP=$(curl -4 -fsS https://ifconfig.me || hostname -I | awk '{print $1}')
fi

PUBLIC_IF=$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="dev") {print $(i+1); exit}}')
PUBLIC_IF="${PUBLIC_IF:-eth0}"

cat > "$WG_CONF" <<EOF
[Interface]
Address = 10.8.0.1/24
ListenPort = ${LISTEN_PORT}
PrivateKey = ${SERVER_PRIVATE}
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o ${PUBLIC_IF} -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o ${PUBLIC_IF} -j MASQUERADE
EOF
chmod 600 "$WG_CONF"

grep -q '^net.ipv4.ip_forward=1' /etc/sysctl.conf 2>/dev/null || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
sysctl -p >/dev/null

if command -v ufw >/dev/null 2>&1; then
  ufw allow "${LISTEN_PORT}/udp" || true
fi

systemctl enable "wg-quick@${WG_INTERFACE}" || true
wg-quick down "$WG_INTERFACE" 2>/dev/null || true
wg-quick up "$WG_INTERFACE"

ENV_FILE="${APP_DIR}/.env.production"
if [ -f "$ENV_FILE" ]; then
  grep -q '^VPN_ENABLED=' "$ENV_FILE" || echo 'VPN_ENABLED=1' >> "$ENV_FILE"
  grep -q '^VPN_SERVER_PUBLIC_KEY=' "$ENV_FILE" || echo "VPN_SERVER_PUBLIC_KEY=${SERVER_PUBLIC}" >> "$ENV_FILE"
  grep -q '^VPN_SERVER_ENDPOINT=' "$ENV_FILE" || echo "VPN_SERVER_ENDPOINT=${PUBLIC_IP}:${LISTEN_PORT}" >> "$ENV_FILE"
  grep -q '^VPN_SYNC_COMMAND=' "$ENV_FILE" || echo "VPN_SYNC_COMMAND=node ${APP_DIR}/scripts/vpn/wg-sync.mjs" >> "$ENV_FILE"
  grep -q '^VPN_INTERFACE=' "$ENV_FILE" || echo "VPN_INTERFACE=${WG_INTERFACE}" >> "$ENV_FILE"
fi

echo ""
echo "WireGuard installed."
echo "Server public key: ${SERVER_PUBLIC}"
echo "Endpoint: ${PUBLIC_IP}:${LISTEN_PORT}"
echo ""
echo "Add to ${ENV_FILE}:"
echo "VPN_ENABLED=1"
echo "VPN_SERVER_PUBLIC_KEY=${SERVER_PUBLIC}"
echo "VPN_SERVER_ENDPOINT=${PUBLIC_IP}:${LISTEN_PORT}"
echo "VPN_SYNC_COMMAND=node ${APP_DIR}/scripts/vpn/wg-sync.mjs"
echo ""
echo "Then: pm2 restart qhub"
echo "Enable VPN per phone in admin panel → Messenger → VPN toggle"
