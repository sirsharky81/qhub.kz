# QHub Cast — вещание видео на TV через Chromecast

Сервис для отправки видео с телефона или ноутбука на **Chromecast-устройства** (Xiaomi Mi TV Stick, Google Chromecast и т.п.) через встроенный **Google Cast**. Отдельное TV-приложение не требуется.

UI: [`/cast`](/cast) · API: `/api/cast/*` · код: `src/lib/cast/`, `src/app/cast/`

## Назначение

Пользователь открывает QHub Cast, указывает источник видеo, нажимает **Cast на TV** → выбирает приставку в списке → видео воспроизводится на TV. Ноутбук/телефон остаётся пультом.

**YouTube не поддерживается** — на Mi Stick для него есть своё приложение с нативным Cast.

## Поддерживаемые источники (MVP)

| Источник | Пример | Как обрабатывается |
|----------|--------|-------------------|
| Прямой HTTPS URL | `https://cdn.example.com/film.m3u8` | resolve → signed token → Cast CDN proxy |
| QHub Send | `https://www.qhub.kz/s/{shareId}` | meta из Send store, stream через NAS/local |
| Upload с устройства | файл с телефона | temp file в `.data/cast/uploads/` + Redis metadata |

**Не входит в MVP:** сторонние страницы (cinemar.cc через yt-dlp), room-core sync, Custom Cast Receiver.

## Архитектура

```
Телефон/ноутбук (/cast/watch)
    │  Google Cast SDK — loadMedia(streamUrl)
    ▼
Mi Stick (Default Media Receiver CC1AD845)
    │  GET /api/cast/stream/{token}  (+ Range)
    ▼
Cast CDN (Next.js API на qhub.kz)
    │  verify HMAC token → upstream
    ▼
Upstream: CDN / Send NAS / local upload
```

**Cast CDN** — ключевой слой. Chromecast на TV не видит cookies браузера и часто не может взять URL напрямую с чужого CDN. Все потоки идут через **HTTPS URL на qhub.kz**:

```
https://www.qhub.kz/api/cast/stream/{signedToken}
```

Токен живёт **4 часа** (`CAST_STREAM_TTL_SEC`).

## API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/cast/resolve` | URL / Send / `uploadId` → `{ title, streamUrl, contentType, source, warnings? }` |
| GET | `/api/cast/stream/[token]` | Range-aware proxy для Chromecast |
| POST | `/api/cast/upload` | multipart `file` → `{ media, upload, watchUrl }` |
| GET | `/api/cast/upload/[id]/meta` | метаданные загрузки |

### Resolve

Тело `POST /api/cast/resolve`:

```json
{ "url": "https://…/video.m3u8", "password": "…" }
```

или

```json
{ "uploadId": "abc123…" }
```

Логика (`src/lib/cast/resolve.ts`):

1. `uploadId` → lookup Redis + local file
2. YouTube URL → reject (`youtube_not_supported`)
3. Send URL (`/s/{id}`) → проверка transfer, mime `video/*`, пароль
4. иначе → прямой media URL (`.mp4`, `.m3u8`, `.mpd`, …) + SSRF allowlist

### Stream proxy

`src/lib/cast/stream-handler.ts`:

- **`upstreamKind: url`** — fetch upstream с forward `Range`; для `.m3u8` — rewrite сегментов в Cast CDN URLs
- **`upstreamKind: send`** — `openSendFileStream`, атомарный claim для `recordSendDownload` (одноразовые ссылки)
- **`upstreamKind: upload`** — read из `.data/cast/uploads/{uploadId}/`

## Безопасность

| Механизм | Где |
|----------|-----|
| HMAC-SHA256 stream tokens | `src/lib/cast/proxy-token.ts`, secret `CAST_STREAM_SECRET` |
| SSRF guard (только public HTTPS) | `src/lib/cast/allowlist.ts` |
| YouTube block | `src/lib/cast/guard.ts` |
| Send password | проверка только в resolve; токен = proof of auth (Send хранит scrypt, не sha256) |
| Send password в UI | `sessionStorage`, не query `?pw=` |
| Rate limits | `qhub:cast-resolve`, `qhub:cast-upload` в `src/lib/rate-limit.ts` |

## Frontend

| Путь | Компонент | Роль |
|------|-----------|------|
| `/cast` | `CastHomeClient` | ввод URL, upload файла |
| `/cast/watch` | `CastWatchClient` | resolve + preview + Cast |
| — | `CastPlayer` | `<video>` + hls.js для HLS preview |
| — | `CastRemoteControls` | Google Cast SDK, кнопка «Cast на TV» |

Cast SDK загружается динамически:

```
https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1
```

Receiver ID по умолчанию: **Default Media Receiver** `CC1AD845`.

## Redis и хранилище

| Key prefix | Назначение |
|------------|------------|
| `cast:upload:{id}` | metadata upload (JSON) |
| `cast:stream-started:{streamId}` | атомарный claim первого Range-запроса Send |

Upload files: `CAST_LOCAL_ROOT` или `.data/cast/uploads/` (TTL 4 ч).

## Переменные окружения

```bash
# Обязательно в production (иначе fallback на MESSENGER/ADMIN secret с warning)
CAST_STREAM_SECRET=

# Default Media Receiver (можно заменить на Custom Receiver ID из Google Cast Console)
NEXT_PUBLIC_CAST_RECEIVER_ID=CC1AD845

# 0 — скрыть Cast UI
NEXT_PUBLIC_CAST_ENABLED=1

# Опционально: каталог upload на VPS
# CAST_LOCAL_ROOT=/var/www/qhub.kz/.data/cast/uploads
```

На VPS после первого деплоя рекомендуется добавить `CAST_STREAM_SECRET` в `.env.production` и `pm2 restart qhub --update-env`.

## Send + Cast: одноразовые ссылки

При первом **атомарном** claim stream token вызывается `recordSendDownload`. Параллельные Range-запросы от плеера не должны дважды списывать одноразовую ссылку — для этого `SET NX` в Redis (`claimCastSendStreamStart`).

Пользователю показывается предупреждение, если `maxDownloads === 1`.

## HLS

Master/media playlist rewrite: относительные URL сегментов заменяются на `/api/cast/stream/{subToken}`.

**Ограничение MVP:** `EXT-X-KEY` (шифрование) и `EXT-X-MAP` (fMP4 init) не переписываются — DRM/HLS с ключами может не работать через Default Receiver.

## PWA

Manifest: `public/tools/cast/manifest.json`  
Share target: URL → `/cast/watch`, video files → `/cast`

## Тесты

```bash
npm test -- src/lib/cast
```

Покрытие: guard (YouTube), allowlist (SSRF), proxy-token (sign/verify/expiry), parse Send URL.

## Phase 2 (не реализовано)

- yt-dlp resolve для сторонних сайтов
- Custom/Styled Cast Receiver
- room-core sync / очередь воспроизведения
- AirPlay для Safari iOS

## Связанные модули

| Модуль | Связь |
|--------|-------|
| Send (`src/lib/send/`) | источник файлов, `openSendFileStream` |
| Music stream proxy | образец Range-forward (`api/music/remote/stream`) |
| Share | паттерн PWA shell, rate limit, CORS |
