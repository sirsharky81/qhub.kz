# QHub на VPS — как устроен production

Документ описывает, как приложение **qhub.kz** работает на self-hosted сервере (Hetzner VPS) после миграции с Vercel + Upstash Redis.

---

## Общая схема

```
Клиенты (браузер, Android/iOS Capacitor)
        │
        ▼
   DNS: qhub.kz / www.qhub.kz → 65.108.215.248
        │
        ▼
   nginx (:443 / :80, Let's Encrypt)
        │  proxy_pass → 127.0.0.1:3000
        │  WebSocket upgrade для мессенджера
        ▼
   PM2 → npm start (Next.js 16, Node 24)
        │
        ├──► PM2 `qhub-ws` → npm run start:ws (:3001, WebSocket)
        │
        ├──► Redis 8 (127.0.0.1:6379, пароль, только localhost)
        │
        ├──► WireGuard VPN (wg0, UDP :51820) — личный VPN для whitelist
        │
        └──► Внешние API:
             Cloudflare Turnstile, Telegram, OpenAI,
             Firebase FCM, Web Push (VAPID), Metered TURN
```

**Бэкап (не в основном трафике):** Vercel (`*.vercel.app`) + Upstash Redis. Откат — смена DNS обратно на Vercel.

---

## Сервер

| Параметр | Значение |
|----------|----------|
| Провайдер | Hetzner Cloud |
| Тип | CX23 (4 GB RAM) |
| Локация | Helsinki |
| IP | `65.108.215.248` |
| ОС | Ubuntu 26.04 |
| SSH-ключ | `~/.ssh/id_ed25519_qhub` (на ПК пользователя) |

### Пути на сервере

| Путь | Назначение |
|------|------------|
| `/var/www/qhub.kz` | Клон репозитория, сборка Next.js |
| `/var/www/qhub.kz/.env.production` | Production-переменные окружения |
| `/root/.redis_password` | Пароль локального Redis |
| `/etc/nginx/sites-available/qhub.kz` | Конфиг nginx |
| PM2 process `qhub` | `npm start` в `/var/www/qhub.kz` |
| PM2 process `qhub-ws` | `npm run start:ws` — Messenger WebSocket (:3001) |

### Домены

- **www.qhub.kz** — основной production (A → VPS)
- **qhub.kz** — редирект на `www` (308)
- **vps.qhub.kz** — тестовый поддомен на тот же сервер

---

## Поток запроса

1. Пользователь открывает `https://www.qhub.kz`.
2. **nginx** принимает HTTPS, проксирует на Node-процесс `:3000`.
3. **Next.js** (App Router) отдаёт страницы и API routes (`/api/*`).
4. Серверные handlers читают/пишут данные через **единый Redis-слой** (`src/lib/redis/`).
5. Rate limit, push, звонки и т.д. вызывают внешние сервисы по env-переменным.

Capacitor-приложения (Android/iOS) — это **оболочка WebView**, которая грузит тот же URL (`capacitor.config.ts` → `https://www.qhub.kz`). Пересборка нативного приложения для веб-изменений **не нужна**, пока домен не меняется.

---

## Redis: два бэкенда, один код

Логика выбора — `src/lib/redis/env.ts`:

| Условие | Бэкенд | Клиент |
|---------|--------|--------|
| Задан `REDIS_URL` | **tcp** (приоритет) | ioredis → локальный Redis |
| Иначе `UPSTASH_REDIS_REST_URL` + `TOKEN` | **upstash** | @upstash/redis (HTTP REST) |
| Ничего не задано | Redis недоступен | — |

**На VPS** используется только:

```env
REDIS_URL=redis://:PASSWORD@127.0.0.1:6379
```

Переменные `UPSTASH_*` на VPS **не нужны**.

**На Vercel** (бэкап) — наоборот: `UPSTASH_*`, без `REDIS_URL`.

### Что хранится в Redis

| Модуль | Файлы | Примеры ключей |
|--------|-------|----------------|
| Мессенджер | `src/lib/messenger/redis.ts`, `call-store.ts` | сессии, whitelist, сообщения, звонки |
| Family | `src/lib/family/redis.ts` | комнаты, push-подписки |
| Админка | `src/lib/admin/store.ts` | hash пароля, скрытые приложения |
| Lotto | `src/lib/lotto-rooms/store.ts` | комнаты игры |
| Hearts | `src/lib/games/hearts/rooms/store.ts` | комнаты игры |
| Rate limit | `src/lib/rate-limit.ts` | счётчики по IP/префиксам |

Общие команды — `src/lib/redis/commands.ts` (`redisGet`, `redisSet`, `redisLpush`, …).

### Rate limit на VPS vs Vercel

- **VPS (`REDIS_URL`)** — sliding window через sorted sets в ioredis (`checkTcpRateLimit`).
- **Vercel (Upstash)** — `@upstash/ratelimit`.

---

## Переменные окружения (`.env.production`)

Полный список — в `.env.example`. На VPS обязательно:

```env
NODE_ENV=production
PORT=3000
REDIS_URL=redis://:...@127.0.0.1:6379

# Сессии
ADMIN_SESSION_SECRET=
MESSENGER_SESSION_SECRET=

# Messenger WebSocket (VPS only; requires TCP Redis pub/sub)
NEXT_PUBLIC_MESSENGER_WS=1
MESSENGER_WS_PORT=3001
# NEXT_PUBLIC_MESSENGER_WS_URL=wss://www.qhub.kz/ws/messenger

# Turnstile, Telegram, OpenAI, VAPID, Firebase FCM, Metered TURN — как на Vercel
```

Файл: `/var/www/qhub.kz/.env.production`, права `600`.

---

## Деплой (обновление production)

После `git push` в `main` GitHub Actions **автоматически** деплоит на VPS (аналог Vercel).

Поток:

```
git push origin main  →  CI (lint, typecheck, build)  →  SSH на VPS  →  vps-deploy.sh
```

Скрипт деплоя: `scripts/deploy/vps-deploy.sh` (pull → `npm ci` → build → `pm2 restart` → health-check).

Workflow: `.github/workflows/deploy.yml`.

### Однократная настройка GitHub Secrets

В репозитории: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Значение |
|--------|----------|
| `VPS_HOST` | `65.108.215.248` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | содержимое приватного ключа `~/.ssh/id_ed25519_qhub` |

Публичный ключ от этой пары должен быть в `~/.ssh/authorized_keys` на VPS.

Проверить статус деплоя:

```bash
gh run list --workflow=deploy.yml --limit 5
gh run watch
```

### Ручной деплой (если нужен)

```bash
ssh -i ~/.ssh/id_ed25519_qhub root@65.108.215.248
bash /var/www/qhub.kz/scripts/deploy/vps-deploy.sh
```

Первичная установка — `scripts/deploy/vps-bootstrap.sh` (nginx, clone, build, подсказки по PM2 и certbot).

### Синхронизация между машинами

| Где | Действие |
|-----|----------|
| Cursor (любой ПК / iPhone) | commit → `git push origin main` → автодеплой |
| Другой ноутбук | `git pull origin main` |
| **Production** | Автоматически через GitHub Actions |
| iPhone/Android app | Ничего — UI с `www.qhub.kz` |

---

## Мониторинг и проверки

На Vercel был дашборд деплоев. На VPS статус смотрят вручную:

### PM2 — процесс жив?

```bash
pm2 status
pm2 logs qhub --lines 50
pm2 logs qhub-ws --lines 50   # Messenger WebSocket
```

`online` — OK; `errored` или частые рестарты — смотреть логи сборки/рантайма.

### Messenger WebSocket

| Компонент | Путь / порт |
|-----------|-------------|
| Клиент | `wss://www.qhub.kz/ws/messenger` |
| Сервер | `scripts/realtime/ws-server.mjs` → `127.0.0.1:3001` |
| nginx | `location /ws/messenger` → proxy на :3001 |
| Feature flag | `NEXT_PUBLIC_MESSENGER_WS=1` в `.env.production` |

Включение (после первого деплоя с WS-кодом):

```bash
pm2 start npm --name qhub-ws -- run start:ws
pm2 save
```

Клиент автоматически **fallback на HTTP poll**, если WS недоступен (Vercel, `qhub-ws` остановлен, сеть).

### Rollback WebSocket

| Уровень | Действие | Время |
|---------|----------|-------|
| 1 — мгновенный | `NEXT_PUBLIC_MESSENGER_WS=0` → `npm run build` → `pm2 restart qhub` | ~5 мин |
| 2 — остановить WS | `pm2 stop qhub-ws` (клиенты с WS=1 перейдут на poll) | секунды |
| 3 — откат кода | `git revert` коммитов WS; poll API не удаляются | деплой |
| 4 — DNS на Vercel | WS на Vercel не работает → poll автоматически | ~5 мин DNS |

**Критерии отката:** connect success rate < 95% за 15 мин; p99 latency сигналов хуже poll; `qhub-ws` restarts > 3/час.

**Не удалять** `/api/messenger/poll` и call poll routes минимум 2 недели после включения WS в production.

### Какой commit в проде?

```bash
cd /var/www/qhub.kz && git log -1 --oneline
```

Сравнить с последним commit на GitHub.

### Health-check интеграций

```bash
python3 /var/www/qhub.kz/scripts/deploy/vps-health-check.py
```

Проверяет: HTTPS, Redis (локальный + сверка REDIS_URL), Turnstile, Telegram, OpenAI, VAPID, Firebase, Coturn/static TURN (или Metered, если включён), session secrets.

### Быстро снаружи (без SSH)

- Сайт: https://www.qhub.kz
- Версия из env (не git SHA): https://www.qhub.kz/api/app/config

---

## Локальный Redis на VPS

- Пакет: **redis-server** (Redis 8)
- Слушает только **127.0.0.1** — с интернета недоступен
- Пароль: `/root/.redis_password`
- UFW: открыт SSH; порт 6379 снаружи закрыт
- Лимит памяти: `maxmemory 512mb`, политика `allkeys-lru`

### Миграция данных с Upstash (один раз)

```bash
# На VPS, с временным migrate.env (UPSTASH_* + REDIS_URL)
node scripts/migrate-upstash-to-redis.mjs
```

Копирует ключи по паттернам `qhub:*`, `family:*`.

---

## Capacitor (Android / iOS)

`capacitor.config.ts`:

- `server.url` → `https://www.qhub.kz` (или `CAPACITOR_SERVER_URL` при сборке)
- `webDir: out` — минимальный offline fallback (`capacitor-shell/`), не основной UI

Сборка нативной оболочки: `npm run build:capacitor` → `npx cap sync`.

Новая сборка в Store нужна только при изменении **нативного** кода (`ios/`, `android/`), плагинов, permissions или URL в конфиге.

---

## Откат на Vercel

1. DNS `qhub.kz` / `www.qhub.kz` → обратно на Vercel.
2. Vercel + Upstash env не трогали — сайт поднимется на старом стеке.
3. TTL DNS был 300 — переключение ~5 минут.

---

## Upstash после миграции

Production-трафик **не** идёт в Upstash (всё через локальный Redis). Upstash на pay-as-you-go можно:

- **1–2 недели** оставить для бэкапа Vercel;
- затем проверить Usage в консоли Upstash;
- при стабильном VPS — удалить базу / убрать `UPSTASH_*` с Vercel (бэкап без Redis станет неполным).

---

## Полезные команды

```bash
# SSH
ssh -i ~/.ssh/id_ed25519_qhub root@65.108.215.248

# Redis ping
REDIS_PASS=$(cat /root/.redis_password)
redis-cli -a "$REDIS_PASS" --no-auth-warning PING

# nginx
nginx -t && systemctl reload nginx

# PM2 автозапуск
pm2 save && pm2 startup

# Логи nginx
tail -f /var/log/nginx/error.log
```

---

## VPN (WireGuard)

Устанавливается **автоматически** при первом деплое после merge VPN-кода (`vps-deploy.sh` → `vpn-bootstrap.sh`).

| Параметр | Значение |
|----------|----------|
| Интерфейс | `wg0` |
| Порт | UDP `51820` |
| Портал | `/tools/vpn` (доступ по whitelist + `vpnEnabled`) |
| Синхронизация peers | `VPN_SYNC_COMMAND` в `.env.production` |

Подробно: `docs/vpn.md`. Проверка на сервере:

```bash
ssh -i ~/.ssh/id_ed25519_qhub root@65.108.215.248
wg show
grep '^VPN_' /var/www/qhub.kz/.env.production
```

---

## Связанные файлы в репозитории

| Файл | Назначение |
|------|------------|
| `scripts/deploy/vps-bootstrap.sh` | Первичная установка на Ubuntu |
| `scripts/deploy/vps-deploy.sh` | Деплой: pull, build, pm2 restart, health-check |
| `scripts/deploy/vpn-bootstrap.sh` | WireGuard VPN (первый деплой) |
| `scripts/vpn/wg-sync.mjs` | Синхронизация VPN peers Redis → wg0 |
| `docs/vpn.md` | Настройка и выдача доступа пользователям |
| `scripts/deploy/vps-health-check.py` | Проверка интеграций на сервере |
| `scripts/migrate-upstash-to-redis.mjs` | Перенос ключей Upstash → VPS Redis |
| `src/lib/redis/` | Выбор бэкенда и команды Redis |
| `scripts/realtime/ws-server.mjs` | Messenger WebSocket server |
| `src/lib/messenger/realtime/` | Протокол, publish, клиент |
| `src/lib/rate-limit.ts` | Rate limit (TCP / Upstash) |
| `.env.example` | Шаблон переменных окружения |
| `capacitor.config.ts` | Remote URL для мобильных оболочек |

---

## CI на GitHub

| Workflow | Когда | Что делает |
|----------|-------|------------|
| `ci.yml` | pull request → `main` | lint, typecheck, build web и Capacitor |
| `deploy.yml` | push → `main` | те же проверки + SSH-деплой на VPS |

Откат: `git revert` нужного коммита → `git push origin main` → автодеплой предыдущей версии.
