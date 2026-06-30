# QHub Capacitor Migration Audit

**Date:** 2026-06-29  
**Next.js:** 16.2.7 | **Capacitor:** not installed (pre-migration baseline)

## 1. Server Components with server-side data access

| File | Server logic | Capacitor action |
|------|--------------|------------------|
| `src/app/layout.tsx` | `headers()` + `getCatalogForViewer()` → Redis | Client fetch via `GET /api/catalog` |
| `src/app/page.tsx` | `headers()` + `getCatalogForViewer()` → Redis | Client fetch via `GET /api/catalog` |
| `src/app/tools/messenger/page.tsx` | `getMessengerSession()` cookie + redirect | Client redirect via access-check API |
| `src/app/tools/family/join/page.tsx` | `searchParams` + `redirect()` | Client redirect component |
| `src/app/tools/family/room/[roomId]/page.tsx` | params + `redirect()` | Static page + client redirect |
| `src/app/tools/family/map/[roomId]/page.tsx` | params + `redirect()` | Static page + client redirect |
| `src/app/tools/family/parent/room/[roomId]/page.tsx` | params only → client | Query param `?id=` |
| `src/app/tools/family/parent/map/[roomId]/page.tsx` | params only → client | Query param `?id=` |
| `src/app/tools/pdf-pages/page.tsx` | `searchParams` only (no fetch) | OK as client or static |

## 2. API routes (49 total)

### Admin (Capacitor: web-only, excluded from mobile UX)
- `POST/DELETE /api/admin/login`
- `POST /api/admin/change-password`
- `GET/PATCH /api/admin/apps`
- `GET/PATCH/POST /api/admin/messenger/whitelist`
- `POST /api/admin/messenger/reset-pin`

### Audio extractor (dev-only, server yt-dlp)
- `POST /api/audio-extractor/metadata`
- `POST /api/audio-extractor/stream`
- `POST /api/audio-extractor/youtube-resolve`

### Family
- `POST /api/family/rooms` — create room
- `GET/PATCH/DELETE /api/family/rooms/[roomId]`
- `POST /api/family/rooms/[roomId]/bind-token`
- `POST /api/family/rooms/[roomId]/parent-invite`
- `POST /api/family/child/pairing`, `GET /api/family/child/pairing`
- `POST /api/family/parent/adopt-child`
- `POST /api/family/bind`
- `POST /api/family/location` — **foreground/background coords**
- `POST /api/family/location/batch` — **planned for offline flush**
- `GET /api/family/poll` — room snapshot polling
- `POST /api/family/member/share-location`
- `POST /api/family/member/leave`
- `DELETE /api/family/members/[memberId]`
- `POST /api/family/sos`, `DELETE /api/family/sos/[memberId]`
- `GET /api/family/push/vapid`, `POST /api/family/push/subscribe`

### Messenger
- `POST/GET /api/messenger/auth/login`
- `DELETE /api/messenger/auth/logout`
- `POST /api/messenger/auth/identify`
- `POST /api/messenger/auth/set-pin`
- `GET /api/messenger/access-check`
- `POST /api/messenger/send`
- `GET /api/messenger/poll`
- `POST /api/messenger/ack`
- `GET/PUT /api/messenger/pubkey`
- `GET/PATCH /api/messenger/profile`
- `GET /api/messenger/contacts`
- `POST/GET /api/messenger/room`
- `POST /api/messenger/room/members`
- `GET /api/messenger/push/vapid`, `POST /api/messenger/push/subscribe`

### Other
- `POST /api/lotto/rooms`, `GET/PATCH/DELETE /api/lotto/rooms/[code]`
- `POST /api/lotto/rooms/[code]/join`, `POST /api/lotto/rooms/[code]/leave`
- `POST /api/recipes/generate`, `analyze-photo`, `generate-image`
- `POST /api/ideas`, `POST /api/submit-developer`
- `POST /api/debug-log`
- `GET /api/catalog` — **added for static export**
- `GET /api/app/config` — **added for version/remote flags**

## 3. next/image usage

4 files use `next/image` — mitigated by `images.unoptimized: true` in `next.config.capacitor.ts`:
- `src/components/home/AppCard.tsx`
- `src/app/tools/document-scanner/components/HomeScreen.tsx`
- `src/app/merch/page.tsx`
- `src/app/apps/recipe-finder/page.tsx`

## 4. Middleware

`src/middleware.ts` — admin panel auth + audio-extractor dev-only gate.  
**Not used in Capacitor static bundle.** API routes remain on Vercel with middleware on server.

## 5. Dynamic page routes (static export blockers)

| Route | Fix |
|-------|-----|
| `tools/family/parent/room/[roomId]` | → `tools/family/parent/room?id=` |
| `tools/family/parent/map/[roomId]` | → `tools/family/parent/map?id=` |
| `tools/messenger/chat/[peerId]` | → `tools/messenger/chat?peer=` |
| `tools/messenger/room/[roomId]` | → `tools/messenger/room?id=` |
| Legacy family redirects | Client-side redirect pages |

## 6. WASM / heavy client libraries (smoke-test in WebView)

| Tool | Library | Risk |
|------|---------|------|
| File converter | `@ffmpeg/ffmpeg` WASM | MIME/CORS from capacitor origin |
| Music editor | FFmpeg WASM | Same |
| Passport Photo | `face-api.js` + `/public/models/` | Model loading path |
| Document scanner | OpenCV WASM | Large bundle |
| Guitar tuner | AudioWorklet | Mic permissions |
| Messenger | MediaRecorder WebM | Codec support |
| PDF Pages | `pdfjs-dist` | Usually OK |

## 7. POST fetch points for Offline Queue

### Priority (family + messenger)
- `src/lib/family/client.ts` — 12 POST endpoints (location, sos, bind, rooms, …)
- `src/lib/messenger/client.ts` — send, ack, auth, room, pubkey
- `src/lib/family/push.ts`, `src/lib/messenger/push.ts` — push subscribe

### Secondary
- `src/lib/lotto-rooms/client.ts` — lotto room ops
- `src/lib/audio-extractor/*` — server-only tool
- `src/lib/debug-agent-log.ts` — debug

## 8. Auth model notes

| Module | Mechanism | Capacitor |
|--------|-----------|-----------|
| Family | `X-Family-Member-Id` + `X-Family-Access-Token` headers | OK |
| Messenger | httpOnly cookie `qhub_messenger_session` | **Broken cross-origin** → Bearer token added |
| Admin | httpOnly cookie | Web-only |

## 9. Storage (no SQLite — project decision)

Existing IndexedDB databases **unchanged on v1**:
- `qhub-music`, `qhub-messenger`, `qhub-family`, `qhub-code-scanner`, document-scanner

New platform store:
- `qhub-platform` — offline queue, messenger bearer token

## 10. Deferred decisions (logged)

- Crash reporting SDK: Sentry vs Crashlytics — **deferred**
- OTA updates: **Variant A (store only)**
- Bundle ID: `kz.qhub.app`
- Background geo interval: configurable, default 3 min / 100m distance

## 11. Capacitor build notes

- `npm run build:capacitor` runs `scripts/build-capacitor.mjs` which temporarily removes `src/app/api` and `src/middleware.ts` (API stays on Vercel at `https://qhub.kz/api/*`).
- Static pages use query params instead of dynamic segments (`?id=`, `?peer=`).
- `@capacitor-community/background-geolocation@1.2.26` warns Capacitor 7 target — monitor on Capacitor 8.
