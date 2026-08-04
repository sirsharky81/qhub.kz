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

# After AmneziaWG / network changes IPv6 loopback (::1) may be unavailable; Redis 8
# defaults bind ::1 and exits if it cannot listen there.
redis_conf="/etc/redis/redis.conf"
if [ -f "$redis_conf" ]; then
  echo "[redis-repair] bind 127.0.0.1 only (disable ::1)"
  if grep -qE '^[[:space:]]*bind ' "$redis_conf"; then
    sed -i 's/^[[:space:]]*bind .*/bind 127.0.0.1 -::1/' "$redis_conf"
  else
    printf '\nbind 127.0.0.1 -::1\n' >> "$redis_conf"
  fi
fi

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
redis_cli_auth() {
  if [ -f "$pass_file" ]; then
    local pass
    pass="$(tr -d '\n\r' < "$pass_file")"
    redis-cli -h 127.0.0.1 -p 6379 -a "$pass" --no-auth-warning "$@"
  else
    redis-cli -h 127.0.0.1 -p 6379 "$@"
  fi
}

for _ in $(seq 1 20); do
  if [ "$(redis_cli_auth ping 2>/dev/null)" = "PONG" ]; then
    echo "[redis-repair] PONG (auth)"
    wl_size="$(redis_cli_auth STRLEN qhub:messenger:whitelist 2>/dev/null || echo 0)"
    if [ "${wl_size:-0}" -lt 10 ]; then
      echo "[redis-repair] whitelist empty (${wl_size:-0} bytes) — trying RDB backup restore"
      latest_bak=""
      for f in $(ls -t /var/lib/redis/dump.rdb.bak.* 2>/dev/null); do
        if redis-check-rdb "$f" >/dev/null 2>&1; then
          latest_bak="$f"
          break
        fi
      done
      if [ -n "$latest_bak" ]; then
        echo "[redis-repair] restoring from $latest_bak"
        systemctl stop redis-server 2>/dev/null || true
        cp "$latest_bak" /var/lib/redis/dump.rdb
        chown redis:redis /var/lib/redis/dump.rdb
        rm -f /var/lib/redis/appendonly.aof 2>/dev/null || true
        systemctl start redis-server 2>/dev/null || systemctl restart redis-server
        sleep 2
        wl_size="$(redis_cli_auth STRLEN qhub:messenger:whitelist 2>/dev/null || echo 0)"
        echo "[redis-repair] whitelist after restore: ${wl_size:-0} bytes"
      else
        echo "[redis-repair] no valid RDB backup found — re-add phones in admin"
      fi
    fi
    exit 0
  fi
  sleep 1
done

echo "[redis-repair] FAILED" >&2
journalctl -u redis-server -n 15 --no-pager 2>&1 || true
exit 1
