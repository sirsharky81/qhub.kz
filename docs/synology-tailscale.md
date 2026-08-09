# Synology ↔ VPS (Tailscale) + QHub Music

Связка **DS220+** и Hetzner VPS через Tailscale. Клиенты ходят только на `qhub.kz`; Synology снаружи не раскрывается.

```
Клиент (браузер / приложение)
        │ HTTPS
        ▼
   qhub.kz (nginx → Next.js)
        │ Tailscale 100.x
        ▼
   Navidrome на Synology (:4533)
        │
        ▼
   /volume1/music
```

## Роли

| Узел | Tailscale | Назначение |
|------|-----------|------------|
| Synology `fcloud` | `100.67.214.76` | Navidrome + файлы музыки |
| VPS `qhub-vps` | `100.108.61.105` | QHub API/прокси стрима |

Устройства слушателей в Tailscale **не** нужны.

## Navidrome на Synology

Container Manager, проект `navidrome`, образ `deluan/navidrome:latest`:

- Data: `/volume1/docker/navidrome` → `/data`
- Music: `/volume1/music` → `/music:ro`
- Порт: `4533` (только LAN / Tailscale, **не** Web Station / QuickConnect / проброс роутера)

## Доступ для слушателей

1. Вход в мессенджер QHub (session).
2. Номер `active` в whitelist.
3. Флаг **Music** в админке whitelist (`musicEnabled`, как VPN).

Без флага виден только локальный импорт файлов.

## Env на VPS (`.env.production`)

```bash
MUSIC_REMOTE_ENABLED=1
MUSIC_NAV_URL=http://100.67.214.76:4533
MUSIC_NAV_USER=qhub
MUSIC_NAV_PASS=********
```

После изменения — `pm2 restart qhub` (или полный деплой).

## Проверка

```bash
ssh -i ~/.ssh/id_ed25519_qhub root@65.108.215.248
tailscale status
curl -sS "http://100.67.214.76:4533/ping"
# с auth (Subsonic):
# curl с /rest/ping.view и параметрами u/t/s/v/c
```

API QHub (после входа в мессенджер + Music вкл.):

- `GET /api/music/remote/status`
- `GET /api/music/remote/artists`
- `GET /api/music/remote/stream/[id]`

## Не делать

- Публичный DNS / reverse proxy на Navidrome
- Открывать `:4533` в интернет
- Класть пароль Navidrome в клиент
