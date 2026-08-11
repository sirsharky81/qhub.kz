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
   Synology /volume1/QHubbox
        │
Получатель ← qhub.kz/s/{id} ← только metadata + прокси скачивания
```

## Роли

| Узел | Tailscale | Назначение |
|------|-----------|------------|
| Synology `fcloud` | `100.67.214.76` | WebDAV-хранилище Send |
| VPS `qhub-vps` | `100.108.61.105` | QHub API, Redis metadata |

## Synology: WebDAV

На **DSM 7** WebDAV чаще всего **не** в «Файловых службах» — нужен пакет **WebDAV Server**.

### Вариант A — DSM 7 (рекомендуется для DS220+)

1. **Главное меню** (иконка сетки слева вверху) → **Центр пакетов** (Package Center).
2. Найти **WebDAV Server** → **Установить**.
3. После установки: главное меню → **WebDAV Server** (отдельное приложение).
4. Включить **HTTP** — порт **5005** (достаточно для Tailscale между VPS и NAS).  
   HTTPS (5006) — по желанию.
5. Shared folder **`QHubbox`** — пользователь с read/write (у вас уже есть).
6. **Права приложения WebDAV:** Панель управления → Пользователь → QHub → Приложения → **WebDAV Server** — разрешить.
7. Доступ **только LAN / Tailscale** — **не** пробрасывать 5005/5006 на роутере.

### Вариант B — старые версии DSM

**Панель управления → Файловые службы → вкладка WebDAV** → включить HTTP (5005).

> Если пункта «Файловые службы» нет: откройте **Панель управления** целиком (не «Панель управления системой» в урезанном виде) или используйте поиск в DSM (`WebDAV`).

### Проверка с VPS

```bash
ssh root@65.108.215.248
curl -sS -u 'USER:PASS' -I "http://100.67.214.76:5005/QHubbox/"
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
SEND_WEBDAV_URL=http://100.67.214.76:5005/QHubbox
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
