#!/bin/bash
# QHub VPS deploy — pull main, build, restart PM2, health-check.
# Run on the server: bash scripts/deploy/vps-deploy.sh
set -euo pipefail

APP_DIR=/var/www/qhub.kz
BRANCH=main

cd "$APP_DIR"

echo "==> Fetching origin/$BRANCH"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Installing dependencies"
npm ci

echo "==> Building"
npm run build

echo "==> Restarting PM2"
pm2 restart qhub
if pm2 describe qhub-ws >/dev/null 2>&1; then
  pm2 restart qhub-ws
else
  pm2 start npm --name qhub-ws -- run start:ws
fi

echo "==> Health check"
python3 scripts/deploy/vps-health-check.py

echo "==> Deployed: $(git log -1 --oneline)"
