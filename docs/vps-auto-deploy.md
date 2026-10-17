# VPS auto-deploy from `main`

This repository now includes `.github/workflows/deploy-vps.yml` that deploys to VPS automatically on every push to `main` (and can also be started manually via **Run workflow**).

## 1) Configure GitHub Actions secrets

In GitHub repository settings, add:

- `VPS_HOST` — server hostname or IP
- `VPS_USER` — SSH user
- `VPS_SSH_KEY` — private key for the user (PEM/OpenSSH)
- `VPS_PORT` — optional, defaults to `22`

## 2) Prepare server once

Expected app path on server:

```bash
/var/www/qhub.kz
```

Expected runtime process name:

```bash
qhub
```

If app was never started with PM2, run once:

```bash
cd /var/www/qhub.kz
npm ci
npm run build
pm2 start npm --name qhub -- start
pm2 save
```

## 3) What workflow does on deploy

On VPS:

1. `git fetch origin main`
2. `git reset --hard origin/main`
3. `npm ci`
4. `npm run build`
5. `pm2 restart qhub --update-env` (or first start if process does not exist)
6. local health probe `curl http://127.0.0.1:3000`

## 4) Safety notes

- Keep production env vars in server `.env.production` (not in repository).
- Use a dedicated deploy SSH key with restricted server access.
- Workflow has concurrency lock to avoid overlapping deploys.
