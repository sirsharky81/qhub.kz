#!/bin/bash
# Diagnose and repair redis-server on QHub VPS.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

echo "[redis-repair] sysctl vm.overcommit_memory=1"
sysctl -w vm.overcommit_memory=1 >/dev/null 2>&1 || true
grep -q '^vm.overcommit_memory' /etc/sysctl.conf 2>/dev/null \
  || echo 'vm.overcommit_memory = 1' >> /etc/sysctl.conf

systemctl reset-failed redis-server 2>/dev/null || true

echo "[redis-repair] status before:"
systemctl status redis-server --no-pager 2>&1 | tail -12 || true
[ -f /var/log/redis/redis-server.log ] && tail -15 /var/log/redis/redis-server.log || true

echo "[redis-repair] stopping redis-server"
systemctl stop redis-server 2>/dev/null || true
sleep 1

rm -f /var/run/redis/redis-server.pid /var/run/redis/redis.sock 2>/dev/null || true

if [ -d /var/lib/redis ]; then
  chown -R redis:redis /var/lib/redis
  chmod 770 /var/lib/redis
fi

ts="$(date +%s)"
if [ -f /var/lib/redis/dump.rdb ]; then
  echo "[redis-repair] checking RDB"
  if ! redis-check-rdb /var/lib/redis/dump.rdb >/dev/null 2>&1; then
    echo "[redis-repair] corrupt dump.rdb — moving aside"
    mv /var/lib/redis/dump.rdb "/var/lib/redis/dump.rdb.bak.${ts}"
  fi
fi

if [ -f /var/lib/redis/appendonly.aof ]; then
  echo "[redis-repair] checking AOF"
  if ! redis-check-aof /var/lib/redis/appendonly.aof >/dev/null 2>&1; then
    redis-check-aof --fix /var/lib/redis/appendonly.aof >/dev/null 2>&1 \
      || mv /var/lib/redis/appendonly.aof "/var/lib/redis/appendonly.aof.bak.${ts}"
  fi
fi

echo "[redis-repair] starting redis-server"
systemctl enable redis-server 2>/dev/null || true
if ! systemctl start redis-server 2>/dev/null; then
  systemctl reset-failed redis-server 2>/dev/null || true
  echo "[redis-repair] first start failed — moving data files aside"
  [ -f /var/lib/redis/dump.rdb ] && mv /var/lib/redis/dump.rdb "/var/lib/redis/dump.rdb.bak.${ts}.1"
  [ -f /var/lib/redis/appendonly.aof ] && mv /var/lib/redis/appendonly.aof "/var/lib/redis/appendonly.aof.bak.${ts}.1"
  chown -R redis:redis /var/lib/redis
  systemctl start redis-server 2>/dev/null || systemctl restart redis-server
fi

sleep 2
[ -f /var/log/redis/redis-server.log ] && tail -15 /var/log/redis/redis-server.log || true

pass_file="/root/.redis_password"
for _ in $(seq 1 20); do
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

echo "[redis-repair] FAILED" >&2
journalctl -u redis-server -n 15 --no-pager 2>&1 || true
exit 1
