#!/bin/bash
# Diagnose WireGuard listen ports (443 vs 51820). Restores production port after wg probe.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
WG_INTERFACE="${VPN_INTERFACE:-wg0}"
WG_CONF="/etc/wireguard/${WG_INTERFACE}.conf"
PROD_PORT="${VPN_PROD_PORT:-51820}"
TEST_PORT="${VPN_TEST_PORT:-443}"

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

echo "========== QHub VPN port diagnostic =========="
echo "time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo ""
echo "--- UDP listeners (443, 51820) ---"
ss -ulnp 2>/dev/null | grep -E ':443 |:51820 ' || echo "(none)"

echo ""
echo "--- WireGuard wg0 (before) ---"
if wg show "$WG_INTERFACE" 2>/dev/null; then
  wg show "$WG_INTERFACE" | awk '/listening port:/ {print "listening port:", $3}'
else
  echo "wg0 not running"
fi

echo ""
echo "--- ListenPort in ${WG_CONF} ---"
grep -E '^ListenPort' "$WG_CONF" 2>/dev/null || echo "(missing)"

echo ""
echo "--- Python UDP bind test (no WireGuard) ---"
for P in "$TEST_PORT" "$PROD_PORT"; do
  if python3 - "$P" <<'PY'
import socket, sys
port = int(sys.argv[1])
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    s.bind(("0.0.0.0", port))
    print(f"  UDP {port}: bind OK")
except OSError as e:
    print(f"  UDP {port}: bind FAILED — {e}")
finally:
    s.close()
PY
  then true; else echo "  UDP ${P}: python test error"; fi
done

echo ""
echo "--- WireGuard probe: ListenPort ${TEST_PORT} (then restore ${PROD_PORT}) ---"

backup="/tmp/qhub-wg0.conf.porttest.$(date +%s)"
cp "$WG_CONF" "$backup"

restore_wg() {
  cp "$backup" "$WG_CONF"
  if [ -f "$APP_DIR/.env.production" ]; then
    sed -i "s|^VPN_LISTEN_PORT=.*|VPN_LISTEN_PORT=${PROD_PORT}|" "$APP_DIR/.env.production" 2>/dev/null || true
    sed -i "s|^VPN_SERVER_ENDPOINT=.*|VPN_SERVER_ENDPOINT=$(grep -E '^VPN_SERVER_ENDPOINT=' "$APP_DIR/.env.production" | cut -d= -f2- | sed 's/:[0-9]*$//'):${PROD_PORT}|" "$APP_DIR/.env.production" 2>/dev/null || true
  fi
  systemctl stop "wg-quick@${WG_INTERFACE}" 2>/dev/null || true
  wg-quick down "$WG_INTERFACE" 2>/dev/null || true
  ip link del "$WG_INTERFACE" 2>/dev/null || true
  sleep 1
  sed -i "s/^ListenPort = .*/ListenPort = ${PROD_PORT}/" "$WG_CONF"
  if [ -f "$APP_DIR/scripts/vpn/restart-wg.sh" ]; then
    VPN_LISTEN_PORT="$PROD_PORT" bash "$APP_DIR/scripts/vpn/restart-wg.sh" || wg-quick up "$WG_CONF"
  else
    wg-quick up "$WG_CONF"
  fi
}

trap restore_wg EXIT

systemctl stop "wg-quick@${WG_INTERFACE}" 2>/dev/null || true
wg-quick down "$WG_INTERFACE" 2>/dev/null || true
ip link del "$WG_INTERFACE" 2>/dev/null || true
sleep 1

sed -i "s/^ListenPort = .*/ListenPort = ${TEST_PORT}/" "$WG_CONF"

set +e
wg_quick_out=$(wg-quick up "$WG_INTERFACE" 2>&1)
wg_quick_rc=$?
set -e

echo "wg-quick up (port ${TEST_PORT}) exit=${wg_quick_rc}"
if [ -n "$wg_quick_out" ]; then
  echo "$wg_quick_out" | tail -20
fi

if [ "$wg_quick_rc" -eq 0 ] && wg show "$WG_INTERFACE" 2>/dev/null | grep -q "listening port: ${TEST_PORT}"; then
  echo "RESULT: WireGuard on UDP ${TEST_PORT} — SUCCESS"
else
  echo "RESULT: WireGuard on UDP ${TEST_PORT} — FAILED"
fi

echo ""
echo "--- Restoring production port ${PROD_PORT} ---"
restore_wg
trap - EXIT

if wg show "$WG_INTERFACE" 2>/dev/null | grep -q "listening port: ${PROD_PORT}"; then
  echo "RESTORE: OK — listening UDP ${PROD_PORT}, peers: $(wg show "$WG_INTERFACE" peers | wc -w)"
else
  echo "RESTORE: WARNING — check wg0 manually"
  wg show "$WG_INTERFACE" 2>/dev/null || true
fi

echo "========== done =========="
