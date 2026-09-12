#!/bin/bash
# Print AmneziaWG / Redis / forwarding diagnostics (no secrets).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

echo "==> Redis"
if [ -f /root/.redis_password ]; then
  pass="$(tr -d '\n\r' < /root/.redis_password)"
  redis-cli -h 127.0.0.1 -p 6379 -a "$pass" --no-auth-warning ping 2>/dev/null || echo "PING failed"
else
  redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null || echo "PING failed"
fi
systemctl is-active redis-server 2>/dev/null || echo "redis-server inactive"

echo "==> ip_forward"
sysctl net.ipv4.ip_forward 2>/dev/null || true

echo "==> awg0"
if awg show awg0 >/dev/null 2>&1; then
  awg show awg0 | awk '/listening port:/ {print "listen UDP", $3}'
  peer_count="$(awg show awg0 | grep -c '^peer:' || true)"
  echo "peers configured: ${peer_count}"
  echo "handshakes:"
  awg show awg0 | awk '/^peer:|latest handshake|transfer:/' | head -40
  grep -E '^(ListenPort|Jc|Jmin|Jmax)' /etc/amnezia/amneziawg/awg0.conf 2>/dev/null || true
else
  echo "awg0: NOT RUNNING"
fi

echo "==> wg0 (WireGuard)"
wg show wg0 2>/dev/null | awk '/listening port:/ {print "listen UDP", $3}' || echo "wg0 down or missing"

echo "==> UDP listeners"
ss -ulnp 2>/dev/null | grep -E '443|51820|3355|awg|wg' || true

echo "==> PM2"
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
try:
    apps=json.load(sys.stdin)
    for a in apps:
        print(a.get('name'), a.get('pm2_env',{}).get('status'))
except Exception:
    pass
" 2>/dev/null || pm2 status 2>/dev/null | tail -5 || true

echo "==> Site local"
curl -sS -o /dev/null -w "127.0.0.1:3000 HTTP %{http_code}\n" --max-time 5 http://127.0.0.1:3000/ 2>/dev/null || echo "app not responding"

echo "==> done"
