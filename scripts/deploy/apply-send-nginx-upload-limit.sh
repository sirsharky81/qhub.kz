#!/usr/bin/env bash
# Allow QHub Send uploads up to ~500 MB (nginx default is 1m → 413 HTML, breaks JSON API).
set -euo pipefail

NGINX_FILE="${NGINX_FILE:-/etc/nginx/sites-available/qhub.kz}"
MAX_SIZE="${SEND_NGINX_MAX_BODY:-520m}"

if [ ! -f "$NGINX_FILE" ]; then
  echo "[send-nginx] skip: $NGINX_FILE not found" >&2
  exit 0
fi

export NGINX_FILE MAX_SIZE
python3 - <<'PY'
import os
import re
from pathlib import Path

path = Path(os.environ["NGINX_FILE"])
max_size = os.environ.get("MAX_SIZE", "520m")
text = path.read_text()

if re.search(r"^\s*client_max_body_size\s+", text, re.M):
    text = re.sub(
        r"^(\s*)client_max_body_size\s+[^;]+;",
        rf"\1client_max_body_size {max_size};",
        text,
        flags=re.M,
    )
else:
    text = re.sub(
        r"^(server\s*\{)\s*$",
        rf"\1\n    client_max_body_size {max_size};",
        text,
        flags=re.M,
    )

if not re.search(r"^\s*client_body_timeout\s+", text, re.M):
    text = re.sub(
        r"^(    client_max_body_size\s+[^;]+;\s*)$",
        r"\1\n    client_body_timeout 300s;",
        text,
        flags=re.M,
    )

path.write_text(text)
print(f"[send-nginx] updated {path} (client_max_body_size={max_size})")
PY

nginx -t
systemctl reload nginx
echo "[send-nginx] nginx reloaded"
