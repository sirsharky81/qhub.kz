#!/bin/bash
set -euo pipefail

APP_DIR=/var/www/qhub.kz
ENV_FILE="$APP_DIR/.env.production"
NGINX_FILE=/etc/nginx/sites-available/qhub.kz

touch "$ENV_FILE"
if grep -q '^NEXT_PUBLIC_MESSENGER_WS=' "$ENV_FILE"; then
  sed -i 's/^NEXT_PUBLIC_MESSENGER_WS=.*/NEXT_PUBLIC_MESSENGER_WS=1/' "$ENV_FILE"
else
  echo 'NEXT_PUBLIC_MESSENGER_WS=1' >> "$ENV_FILE"
fi

if grep -q '^MESSENGER_WS_PORT=' "$ENV_FILE"; then
  sed -i 's/^MESSENGER_WS_PORT=.*/MESSENGER_WS_PORT=3001/' "$ENV_FILE"
else
  echo 'MESSENGER_WS_PORT=3001' >> "$ENV_FILE"
fi

if ! grep -q 'location /ws/messenger' "$NGINX_FILE"; then
  python3 - <<'PY'
from pathlib import Path
snippet = """    location /ws/messenger {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

"""
path = Path("/etc/nginx/sites-available/qhub.kz")
content = path.read_text()
content = content.replace("    location / {", snippet + "    location / {")
path.write_text(content)
PY
fi

nginx -t
systemctl reload nginx

cd "$APP_DIR"
npm run build

if pm2 describe qhub-ws >/dev/null 2>&1; then
  pm2 restart qhub-ws
else
  pm2 start npm --name qhub-ws --cwd "$APP_DIR" -- run start:ws
fi
pm2 restart qhub
pm2 save
pm2 status

echo "WS enabled. Check: pm2 logs qhub-ws --lines 20"
