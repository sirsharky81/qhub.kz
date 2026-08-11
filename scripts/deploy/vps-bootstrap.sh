#!/bin/bash
# QHub VPS bootstrap — run as root on Ubuntu (Hetzner)
set -euo pipefail

APP_DIR=/var/www/qhub.kz
REPO_URL="${REPO_URL:-https://github.com/sirsharky81/qhub.kz.git}"
BRANCH="${BRANCH:-main}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git nginx certbot python3-certbot-nginx

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

npm install -g pm2

mkdir -p "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

cd "$APP_DIR"
if [ -f scripts/kz-maps/install-pmtiles-cli.sh ]; then
  bash scripts/kz-maps/install-pmtiles-cli.sh || true
fi
npm ci
npm run build

cat > /etc/nginx/sites-available/qhub.kz <<'NGINX'
server {
    listen 80;
    server_name vps.qhub.kz qhub.kz www.qhub.kz;
    client_max_body_size 520m;
    client_body_timeout 300s;

    location /ws/messenger {
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

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/qhub.kz /etc/nginx/sites-enabled/qhub.kz
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "Bootstrap done. Next:"
echo "1) Create $APP_DIR/.env.production with REDIS_URL and Vercel env vars"
echo "2) pm2 start npm --name qhub -- start"
echo "2b) pm2 start npm --name qhub-ws -- run start:ws"
echo "3) pm2 save && pm2 startup"
echo "4) certbot --nginx -d vps.qhub.kz (after DNS A record)"
