# Room Core — движок комнат QHub

Общий слой жизненного цикла комнат для новых сервисов QHub.

## Назначение

- создание комнаты и участников;
- приглашения (токен, код, ссылка);
- join / leave;
- версионирование и TTL;
- Redis pub/sub для WebSocket.

## Использование

```typescript
import { createShareRoomEngine } from "@/lib/room-core";

const engine = createShareRoomEngine();
const { room, member, accessToken, inviteToken } = await engine.createRoom("iPhone");
```

## Сервисы

| Сервис | Конфиг | Redis prefix |
|--------|--------|--------------|
| Share | `SHARE_ROOM_CONFIG` | `room-core:share:` |

Split сохраняет собственный Room Core в `src/lib/split/store.ts` (исторически). Новые сервисы должны использовать `src/lib/room-core/`.

## WebSocket

События публикуются в каналы:

- `qhub:room-core:{service}:room:{roomId}`
- `qhub:room-core:{service}:participant:{memberId}`

Realtime-сервер: `scripts/realtime/ws-server.mjs`, путь `/ws/share`.
