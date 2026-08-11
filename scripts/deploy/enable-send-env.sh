#!/usr/bin/env bash
# Idempotently enable QHub Send in .env.production (WebDAV → Synology QHubbox).
# Preserves existing SEND_WEBDAV_* on VPS unless FORCE_SEND_ENV=1 (deploy secrets must not clobber manual setup).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.production}"

SEND_ENABLED="${SEND_ENABLED:-1}"
SEND_STORAGE_BACKEND="${SEND_STORAGE_BACKEND:-webdav}"
SEND_WEBDAV_URL="${SEND_WEBDAV_URL:-http://100.67.214.76:5005/QHubbox}"
SEND_WEBDAV_USER="${SEND_WEBDAV_USER:-QHub}"

if [ ! -f "$ENV_FILE" ]; then
  echo "[send-env] missing $ENV_FILE" >&2
  exit 1
fi

existing_pass=""
existing_user=""
existing_url=""
if grep -q '^SEND_WEBDAV_PASS=' "$ENV_FILE" 2>/dev/null; then
  existing_pass=$(grep '^SEND_WEBDAV_PASS=' "$ENV_FILE" | head -1 | cut -d= -f2-)
fi
if grep -q '^SEND_WEBDAV_USER=' "$ENV_FILE" 2>/dev/null; then
  existing_user=$(grep '^SEND_WEBDAV_USER=' "$ENV_FILE" | head -1 | cut -d= -f2-)
fi
if grep -q '^SEND_WEBDAV_URL=' "$ENV_FILE" 2>/dev/null; then
  existing_url=$(grep '^SEND_WEBDAV_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
fi

if [ "${FORCE_SEND_ENV:-0}" != "1" ]; then
  if [ -n "$existing_pass" ]; then
    SEND_WEBDAV_PASS="$existing_pass"
    echo "[send-env] keeping existing SEND_WEBDAV_PASS"
  fi
  if [ -n "$existing_user" ]; then
    SEND_WEBDAV_USER="$existing_user"
  fi
  if [ -n "$existing_url" ]; then
    SEND_WEBDAV_URL="$existing_url"
  fi
fi

if [ -z "${SEND_WEBDAV_PASS:-}" ]; then
  echo "[send-env] SEND_WEBDAV_PASS missing (set on VPS or pass via env / GitHub secret)" >&2
  exit 1
fi

had_public_url=0
if grep -q '^QHUB_PUBLIC_URL=' "$ENV_FILE" 2>/dev/null; then
  had_public_url=1
fi

tmp="$(mktemp)"
grep -v -E '^(SEND_(ENABLED|STORAGE_BACKEND|WEBDAV_URL|WEBDAV_USER|WEBDAV_PASS|STORAGE_ROOT|MAX_BYTES)|QHUB_PUBLIC_URL)=' \
  "$ENV_FILE" >"$tmp" || true
{
  cat "$tmp"
  echo "SEND_ENABLED=$SEND_ENABLED"
  echo "SEND_STORAGE_BACKEND=$SEND_STORAGE_BACKEND"
  echo "SEND_WEBDAV_URL=$SEND_WEBDAV_URL"
  echo "SEND_WEBDAV_USER=$SEND_WEBDAV_USER"
  echo "SEND_WEBDAV_PASS=$SEND_WEBDAV_PASS"
  if [ "$had_public_url" = "0" ]; then
    echo "QHUB_PUBLIC_URL=https://www.qhub.kz"
  else
    grep '^QHUB_PUBLIC_URL=' "$ENV_FILE" | head -1
  fi
} >"$ENV_FILE"
rm -f "$tmp"
chmod 600 "$ENV_FILE"
echo "[send-env] QHub Send vars updated in $ENV_FILE"
