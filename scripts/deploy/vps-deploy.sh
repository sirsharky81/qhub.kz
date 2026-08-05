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

if [ -f scripts/kz-maps/install-pmtiles-cli.sh ]; then
  echo "==> Ensuring pmtiles CLI (offline map extracts)"
  bash scripts/kz-maps/install-pmtiles-cli.sh || echo "==> Warning: pmtiles CLI install failed"
fi

if [ -f scripts/deploy/vpn-bootstrap.sh ]; then
  if ! command -v wg >/dev/null 2>&1; then
    echo "==> Installing WireGuard VPN (first deploy)"
    bash scripts/deploy/vpn-bootstrap.sh || echo "==> Warning: VPN bootstrap failed"
  elif [ -f .env.production ] && ! grep -q '^VPN_ENABLED=1' .env.production 2>/dev/null; then
    echo "==> Enabling WireGuard VPN in .env.production"
    bash scripts/deploy/vpn-bootstrap.sh || echo "==> Warning: VPN bootstrap failed"
  fi
fi

if [ -f scripts/deploy/mail-bootstrap.sh ]; then
  if ! command -v postfix >/dev/null 2>&1; then
    echo "==> Installing mail stack (first deploy)"
    bash scripts/deploy/mail-bootstrap.sh || echo "==> Warning: mail bootstrap failed"
  elif [ -f .env.production ] && ! grep -q '^MAIL_ENABLED=1' .env.production 2>/dev/null; then
    echo "==> Mail stack present; set MAIL_ENABLED=1 in .env.production after DNS/TLS"
  fi
fi

echo "==> Installing dependencies"
npm ci

echo "==> Building"
npm run build

if [ -f scripts/kz-maps/cleanup-vps-legacy-bundles.sh ]; then
  echo "==> Cleaning legacy offline map bundles (if any)"
  bash scripts/kz-maps/cleanup-vps-legacy-bundles.sh || true
fi

echo "==> Ensure Redis"
chmod +x scripts/deploy/ensure-redis.sh scripts/deploy/repair-redis.sh 2>/dev/null || true
sudo bash scripts/deploy/repair-redis.sh || sudo bash scripts/deploy/ensure-redis.sh || echo "==> Warning: Redis not ready"

echo "==> Restarting PM2"
pm2 restart qhub
if pm2 describe qhub-ws >/dev/null 2>&1; then
  pm2 restart qhub-ws
else
  pm2 start npm --name qhub-ws -- run start:ws
fi

if command -v wg >/dev/null 2>&1 && [ -f scripts/vpn/wg-sync.mjs ] && [ -f .env.production ]; then
  if command -v awg >/dev/null 2>&1 && awg show awg0 >/dev/null 2>&1; then
    echo "==> VPN ports (Amnezia 443 / WireGuard 51820 for Russia)"
    chmod +x scripts/vpn/migrate-russia-ports.sh 2>/dev/null || true
    sudo bash scripts/vpn/migrate-russia-ports.sh || echo "==> Warning: Russia port migration failed"
  else
    echo "==> WireGuard VPN (UDP 443)"
    chmod +x scripts/vpn/restart-wg.sh scripts/vpn/migrate-listen-port.sh 2>/dev/null || true
    sudo VPN_LISTEN_PORT=443 bash scripts/vpn/migrate-listen-port.sh \
      || sudo bash scripts/vpn/restart-wg.sh \
      || echo "==> Warning: WireGuard restart failed"
  fi
fi

echo "==> Health check"
if [ -f scripts/deploy/vps-health-check.py ]; then
  python3 scripts/deploy/vps-health-check.py || echo "==> Health check reported issues (deploy still completed)"
else
  echo "==> Skipping health check (script not in repo yet)"
fi

echo "==> Deployed: $(git log -1 --oneline)"
