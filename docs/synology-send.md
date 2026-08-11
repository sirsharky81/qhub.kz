# Synology ↔ VPS (Tailscale) + QHub Send

Связка **DS220+** и Hetzner VPS через Tailscale. Файлы физически на NAS; клиенты ходят только на `qhub.kz`.

```
Отправитель (whitelist + Send)
        │ HTTPS upload
        ▼
   qhub.kz (Next.js API)
        │ metadata → Redis
        │ file bytes → WebDAV
        ▼ Tailscale 100.x
   Synology /volume1/qhub-send
        │
Получатель ← qhub.kz/s/{id} ← только metadata + прокси скачивания
```

## Роли

| Узел | Tailscale | Назначение |
|------|-----------|------------|
| Synology `fcloud` | `100.67.214.76` | WebDAV-хранилище Send |
| VPS `qhub-vps` | `100.108.61.105` | QHub API, Redis metadata |

## Synology: WebDAV

1. **Панель управления → Файловые службы → WebDAV** — включить HTTP (порт 5005) или HTTPS (5006).
2. Создать shared folder `qhub-send` (или подпапку в существующей).
3. Пользователь с правами read/write (отдельный от Navidrome).
4. Доступ **только LAN / Tailscale** — не пробрасывать в интернет.

Проверка с VPS:

```bash
ssh root@65.108.215.248
curl -sS -u 'USER:PASS' -I "http://100.67.214.76:5005/qhub-send/"
```

## Доступ для отправителей

1. Вход в мессенджер QHub (session).
2. Номер `active` в whitelist.
3. Флаг **Send** в админке (`sendEnabled`, как Music/VPN).

Получателю аккаунт **не** нужен — только ссылка `qhub.kz/s/Ab73kD` и опционально пароль.

## Env на VPS (`.env.production`)

```bash
SEND_ENABLED=1
SEND_STORAGE_BACKEND=webdav
SEND_WEBDAV_URL=http://100.67.214.76:5005/qhub-send
SEND_WEBDAV_USER=qhub
SEND_WEBDAV_PASS=********
# SEND_MAX_BYTES=524288000
```

Локальный режим (dev / без NAS):

```bash
SEND_ENABLED=1
SEND_STORAGE_BACKEND=local
SEND_STORAGE_ROOT=.data/send
```

После изменения — `pm2 restart qhub`.

## Metadata в Redis (VPS)

На каждую ссылку:

| Поле | Описание |
|------|----------|
| `share_id` | Короткий id (`Ab73kD`) |
| `file_path` | Путь на NAS (`{shareId}/filename`) |
| `password_hash` | scrypt или null |
| `expires_at` | Unix ms |
| `download_count` | Счётчик скачиваний |
| `max_downloads` | 1 = одноразовая ссылка |

TTL ключей Redis = срок жизни ссылки. Файл на NAS удаляется при истечении, одноразовом скачивании или отзыве.

## API

**Отправитель (auth):**

- `GET /api/send/status`
- `POST /api/send/create` — multipart `files`, `expiry` (`1h`|`1d`|`7d`), `password`, `oneTime`
- `GET /api/send/mine`
- `DELETE /api/send/{shareId}`

**Получатель (публично по id):**

- `GET /api/send/s/{shareId}/meta`
- `POST /api/send/s/{shareId}/download` — body `{ password? }`

## UI

- Загрузка: https://www.qhub.kz/send
- Скачивание: https://www.qhub.kz/s/{shareId}

## Не делать

- Публичный WebDAV / QuickConnect на NAS
- Хранить файлы в Redis или на VPS без лимита
- Отдавать пароль NAS клиенту

## См. также

- `docs/synology-send.md` — QHub Send (файлы по ссылке на NAS)
- `docs/synology-tailscale.md` — Music / Navidrome (тот же паттерн Tailscale)
