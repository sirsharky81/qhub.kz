# Фаза 2: server-side unread для Room и унификация модели DM/Room

## 1) Цели и критерии успеха

### Цели

1. Убрать `localStorage` как источник истины для room unread.
2. Сделать unread комнаты синхронными между устройствами.
3. Сохранить текущий UX (бейджи, порядок диалогов, разделение непрочитанных).
4. Внедрить миграцию без даунтайма и без регресса по DM.

### Definition of Done

- unread по комнатам одинаковый на нескольких устройствах одного пользователя;
- unread не теряется после relogin/refresh;
- `/api/messenger/dialogs` возвращает server unread для room;
- клиент больше не зависит от локальной unread-карты как primary-источника.

---

## 2) Проблема текущей модели

- DM unread хранится на сервере (Redis user index).
- Room unread хранится локально (`localStorage`) и не синхронизируется.

Последствия:

- расхождение unread между устройствами;
- потеря unread после очистки данных устройства;
- сервер не имеет каноничной картины unread для room.

---

## 3) Целевая модель данных в Redis

### 3.1 Room unread index на пользователя

Расширить room user index (или добавить новый), чтобы хранить:

- `roomId`
- `title`
- `lastMessageAt`
- `lastMessageType`
- `unreadCount`
- `latestUnreadAt`
- `lastReadVersion` (предпочтительно) или `lastReadAt`

### 3.2 Почему `lastReadVersion`

Version-based модель устойчивее timestamp-подхода и проще для корректного расчета непрочитанных на long-poll/cursor-модели.

### 3.3 TTL

TTL room unread index должен быть не меньше жизненного цикла комнаты или задаваться отдельной переменной окружения (например, `MESSENGER_ROOM_USER_INDEX_TTL_SEC`).

---

## 4) Логика обновления unread

### 4.1 На отправке room-сообщения (`/api/messenger/send`)

Для каждого участника комнаты, кроме отправителя:

- `unreadCount += 1`
- `latestUnreadAt = msg.ts`
- `lastMessageAt = msg.ts`
- `lastMessageType = msg.type`

Для отправителя:

- обновить `lastMessageAt`/`lastMessageType`;
- unread не увеличивать.

### 4.2 На чтении комнаты

Добавить endpoint:

- `POST /api/messenger/room/read`
- payload: `{ roomId }` или `{ channel }`

Действия:

- `unreadCount = 0`
- `latestUnreadAt = null`
- `lastReadVersion = currentRoomVersion`

### 4.3 На выходе/удалении участника из комнаты

- удалять room-entry из user index (или переводить в inactive, если это требуется продуктом);
- unread по покинутой комнате не должен отображаться.

---

## 5) API-контракты

### 5.1 `GET /api/messenger/dialogs`

Расширить `roomDialogs` полями unread:

- `unreadCount`
- `latestUnreadAt`
- `lastMessageAt`
- `lastMessageType`

### 5.2 Новый endpoint mark read

- `POST /api/messenger/room/read`
- обязательные проверки: сессия + членство в комнате.

### 5.3 Совместимость на переходе

Временно оставить fallback чтения локального room unread только для старых данных/клиентов.

---

## 6) Клиентская стратегия

### 6.1 Home (`MessengerHomeClient`)

- `dialogUnread(room)` читать из server response;
- aggregate unread считать от серверных значений.

### 6.2 Room Chat (`ChatView`)

- при открытии комнаты/возврате в foreground отправлять `room/read`;
- локальный `incrementRoomUnread` не использовать как источник истины.

### 6.3 Legacy слой (`src/lib/messenger/unread.ts`)

- сначала оставить как UI-cache;
- после стабилизации миграции удалить либо ограничить ролью временной оптимизации.

---

## 7) Пошаговый rollout без даунтайма

### Шаг A — серверная подготовка

1. Расширить Redis-структуру room user index.
2. Писать room unread на send.
3. Добавить `POST /api/messenger/room/read`.

### Шаг B — server read path на клиентах

1. Вернуть room unread через `/api/messenger/dialogs`.
2. Клиент читает server unread, fallback на local unread оставить временно.

### Шаг C — переключение

1. Отключить local unread как primary.
2. Считать бейджи только от server unread.
3. Очистить legacy local unread map по завершении перехода.

---

## 8) Миграция существующих unread

Так как старые room unread локальные:

- начальное серверное unread для существующих комнат может быть `0`;
- состояние нормализуется после первого входа в комнату и новых сообщений;
- опционально можно сделать best-effort import local unread при первом заходе.

---

## 9) Тест-план

### Unit

- корректный инкремент unread для room participants кроме sender;
- сброс unread через room/read;
- корректная очистка unread на leave/remove.

### Integration

- два пользователя в комнате: unread только у получателя;
- два устройства одного пользователя: unread синхронный;
- после relogin unread сохраняется.

### E2E smoke

1. Отправить сообщение в комнате.
2. Убедиться в обновлении unread на home.
3. Открыть комнату и проверить reset unread.
4. Refresh/reopen: unread не возвращается без новых сообщений.

---

## 10) Риски и меры

1. **Двойной подсчет unread (local + server)**
   - server unread сделать приоритетным уже на раннем этапе rollout.
2. **Гонки при массовых send**
   - использовать атомарные Redis-операции/изолированные update-функции.
3. **Слишком короткий TTL**
   - отдельно контролировать TTL room user index.
4. **Рост Redis-объема**
   - мониторить ключи room unread и limit/maxmemory политику.

---

## 11) Метрики успеха после релиза

- расхождение unread между устройствами (должно стремиться к 0);
- успешность `POST /api/messenger/room/read`;
- снижение пользовательских жалоб на неверные unread;
- контролируемый рост Redis памяти по новым ключам.
