#!/bin/bash
# Ensure Redis is running before PM2 / app health checks.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

echo "[redis] ensure redis-server is active"

redis_conf="/etc/redis/redis.conf"
if [ -f "$redis_conf" ]; then
  if grep -qE '^[[:space:]]*bind ' "$redis_conf"; then
    sed -i 's/^[[:space:]]*bind .*/bind 127.0.0.1 -::1/' "$redis_conf"
  else
    printf '\nbind 127.0.0.1 -::1\n' >> "$redis_conf"
  fi
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl enable redis-server 2>/dev/null || true
  if ! systemctl is-active --quiet redis-server 2>/dev/null; then
    systemctl start redis-server 2>/dev/null || systemctl restart redis-server 2>/dev/null || true
  fi
fi

redis_ping() {
  local pass_file="/root/.redis_password"
  if [ -f "$pass_file" ]; then
    local pass
    pass="$(tr -d '\n\r' < "$pass_file")"
    redis-cli -h 127.0.0.1 -p 6379 -a "$pass" --no-auth-warning ping 2>/dev/null
  else
    redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null
  fi
}

for _ in $(seq 1 30); do
  if [ "$(redis_ping)" = "PONG" ]; then
    echo "[redis] PONG"
    exit 0
  fi
  sleep 1
done

echo "[redis] ERROR: not responding on 127.0.0.1:6379" >&2
systemctl status redis-server --no-pager 2>/dev/null | tail -15 >&2 || true
exit 1
