#!/bin/bash
# Diagnose and repair redis-server on QHub VPS.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

echo "[redis-repair] status before:"
systemctl status redis-server --no-pager 2>&1 | tail -12 || true
journalctl -u redis-server -n 15 --no-pager 2>&1 || true

echo "[redis-repair] stopping redis-server"
systemctl stop redis-server 2>/dev/null || true

# Stale pid / socket after crash
rm -f /var/run/redis/redis-server.pid /var/run/redis/redis.sock 2>/dev/null || true

# Fix data dir permissions
if [ -d /var/lib/redis ]; then
  chown -R redis:redis /var/lib/redis 2>/dev/null || chown -R redis:redis /var/lib/redis/
  chmod 770 /var/lib/redis 2>/dev/null || true
fi

# Attempt AOF repair if present (common after hard reboot)
if [ -f /var/lib/redis/appendonly.aof ]; then
  echo "[redis-repair] checking AOF"
  redis-check-aof --fix /var/lib/redis/appendonly.aof 2>/dev/null || true
fi

echo "[redis-repair] starting redis-server"
systemctl enable redis-server 2>/dev/null || true
systemctl start redis-server 2>/dev/null || systemctl restart redis-server

sleep 2
systemctl status redis-server --no-pager 2>&1 | tail -8 || true

pass_file="/root/.redis_password"
for _ in $(seq 1 15); do
  if [ -f "$pass_file" ]; then
    pass="$(tr -d '\n\r' < "$pass_file")"
    if [ "$(redis-cli -h 127.0.0.1 -p 6379 -a "$pass" --no-auth-warning ping 2>/dev/null)" = "PONG" ]; then
      echo "[redis-repair] PONG (auth)"
      exit 0
    fi
  elif [ "$(redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null)" = "PONG" ]; then
    echo "[redis-repair] PONG"
    exit 0
  fi
  sleep 1
done

echo "[redis-repair] FAILED — see journal above" >&2
journalctl -u redis-server -n 20 --no-pager 2>&1 || true
exit 1
