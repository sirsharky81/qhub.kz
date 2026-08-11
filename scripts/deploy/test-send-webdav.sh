#!/usr/bin/env bash
# Test Synology WebDAV from VPS (run after enable-send-env).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.production}"

if [ ! -f "$ENV_FILE" ]; then
  echo "[send-webdav-test] missing $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

URL="${SEND_WEBDAV_URL:-}"
USER="${SEND_WEBDAV_USER:-}"
PASS="${SEND_WEBDAV_PASS:-}"

if [ -z "$URL" ] || [ -z "$USER" ] || [ -z "$PASS" ]; then
  echo "[send-webdav-test] SEND_WEBDAV_* not set" >&2
  exit 1
fi

echo "==> PROPFIND $URL"
curl -sS -u "$USER:$PASS" -X PROPFIND -I "$URL/" | head -5

PROBE="_qhub-probe-$(date +%s).txt"
echo "==> PUT test file"
curl -sS -u "$USER:$PASS" -X PUT --data-binary "probe" -I "$URL/$PROBE" | head -5

echo "==> DELETE test file"
curl -sS -u "$USER:$PASS" -X DELETE -I "$URL/$PROBE" | head -5

echo "[send-webdav-test] done"
