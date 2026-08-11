#!/usr/bin/env bash
# Idempotently enable QHub Send in .env.production (WebDAV → Synology QHubbox).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.production}"

SEND_ENABLED="${SEND_ENABLED:-1}"
SEND_STORAGE_BACKEND="${SEND_STORAGE_BACKEND:-webdav}"
SEND_WEBDAV_URL="${SEND_WEBDAV_URL:-http://100.67.214.76:5005/QHubbox}"
SEND_WEBDAV_USER="${SEND_WEBDAV_USER:-QHub}"
SEND_WEBDAV_PASS="${SEND_WEBDAV_PASS:?Set SEND_WEBDAV_PASS}"

if [ ! -f "$ENV_FILE" ]; then
  echo "[send-env] missing $ENV_FILE" >&2
  exit 1
fi

tmp="$(mktemp)"
grep -v -E '^SEND_(ENABLED|STORAGE_BACKEND|WEBDAV_URL|WEBDAV_USER|WEBDAV_PASS|STORAGE_ROOT|MAX_BYTES)=' "$ENV_FILE" >"$tmp" || true
{
  cat "$tmp"
  echo "SEND_ENABLED=$SEND_ENABLED"
  echo "SEND_STORAGE_BACKEND=$SEND_STORAGE_BACKEND"
  echo "SEND_WEBDAV_URL=$SEND_WEBDAV_URL"
  echo "SEND_WEBDAV_USER=$SEND_WEBDAV_USER"
  echo "SEND_WEBDAV_PASS=$SEND_WEBDAV_PASS"
  if ! grep -q '^QHUB_PUBLIC_URL=' "$ENV_FILE" 2>/dev/null; then
    echo "QHUB_PUBLIC_URL=https://www.qhub.kz"
  fi
} >"$ENV_FILE"
rm -f "$tmp"
chmod 600 "$ENV_FILE"
echo "[send-env] QHub Send vars updated in $ENV_FILE"
