# QHub Split v5.1 — локальные участники: оценка и план

Источник: `docs/tz-splitser-v5.1-local-participants.md`.
Прод сегодня: QHub Split MVP + v5 ledger/advanced UI.
Бренд в UI: **QHub Split** (не «Splitser»).

## Статус

**Phase 0 решений — зафиксирован (2026-07-15).** Код ещё не менялся.
Ответы продукта: A да · B нет · C вне MVP (пояснение ниже) · D после, в комнате.

------------------------------------------------------------------------

## 1. Вердикт

Дополнение **правильное и обязательное** для снижения порога входа.

Сейчас в коде: **участник = bearer session**. У каждого `SplitMember` обязателен `tokenHash`; попадание в комнату = `createRoom` (owner) или `join` по invite. Добавить «Алину» без аккаунта/устройства **нельзя**.

Целевая модель ТЗ:

| Понятие | Роль |
| --- | --- |
| **Participant** | Единственный субъект расходов, балансов, кассы, погашений |
| **User / session** | Опциональная привязка «кто может писать от имени этого Participant» |

Движок денег **уже** работает от `memberId` (participant id): expenses, settlements, ledger, custodian — User в формулах нет. Это хороший задел: v5.1 — в основном identity/UX, не смена ledger.

Масштаб: **средний** — типы + store/API + UI участников + claim-приглашение. Engine/fold почти не трогаем.

------------------------------------------------------------------------

## 2. Как сейчас (кратко)

```text
SplitMember {
  memberId, roomId, displayName, role,
  tokenHash,          // ОБЯЗАТЕЛЕН
  joinedAt, leftAt?
}
```

- `POST /api/split/rooms` → room + owner с accessToken
- `POST .../invite` → одноразовый/переиспользуемый токен до TTL 7d (не привязан к seat)
- `POST /api/split/rooms/join` → **всегда новый** member + новый token
- Auth: `X-Split-Member-Id` + `X-Split-Access-Token`
- Client session: один `localStorage` на комнату

Следствие: «пригласить Аню» создаёт **нового** участника. Если до того уже есть локальная «Аня» с историей — без claim получим **двойной seat** (главный риск миграции UX).

------------------------------------------------------------------------

## 3. Целевая модель

Переименовывать Redis-ключ `split:member:` не обязательно; расширяем JSON и семантику.

```text
Participant (SplitMember v5.1)
  memberId            // стабильный Participant.id — никогда не меняется при connect
  roomId
  displayName
  avatarUrl?          // post-MVP ok; MVP = опционально / заглушка
  role                // owner | member  (owner всегда Connected)
  status              // local | pending_invite | connected
  tokenHash?          // есть только у connected (и временно у pending? — нет, token у actor invite creator)
  linkedUserId?       // null = не привязан к QHub User; MVP может оставаться null даже у connected
  inviteTokenId?      // активное приглашение на этот seat (pending_invite)
  createdAt / joinedAt / leftAt?
```

### Статусы

| Status | Смысл | Session? |
| --- | --- | --- |
| `local` | Seat только в комнате; нет устройства | Нет |
| `pending_invite` | На seat висит invite; ждут claim | Нет |
| `connected` | Есть bearer (accessToken) и/или linkedUserId | Да |

**Важно про User в текущем QHub:** полноценного Splitser-аккаунта отдельно от room token пока нет. В MVP v5.1:

- `Connected` = Participant имеет `tokenHash` (устройство/сессия может действовать от его имени).
- `linkedUserId` — поле зарезервировать; заполнять, когда появится единый QHub user id для Split (мессенджер / passport). Не блокировать MVP ожиданием полноценного User registry.

Операции (expense, settlement, contribution, …) **всегда** ссылаются на `memberId` Participant. Actor запроса = `connected` Participant из headers.

------------------------------------------------------------------------

## 4. Зафиксированные продуктовые решения (§0)

| # | Вопрос | Решение |
| --- | --- | --- |
| 1 | Можно ли начать без invite других? | **Да** — add local → расходы сразу |
| 2 | Owner при создании | Создатель комнаты = `connected` + `role: owner`. Ownerless room **нет** |
| 3 | Кто может добавлять/редактировать locals | Любой **connected** член комнаты. Удаление — см. п.6 |
| 4 | Invite на local | **Seat-bound**: invite привязан к `memberId`. Join **claim**’ит этот Participant (`status → connected`, выдаёт token). Id не меняется |
| 5 | Старый generic invite (`/invite` без seat) | Оба пути; UI по умолчанию — seat-bound |
| 6 | Удаление local с историей | **Нельзя hard-delete**, если есть ops/expenses/settlements. Только rename / soft-leave. Merge — post-MVP |
| 7 | `paidBy` / custodian = local | **Разрешено** |
| 8 | Аватар | MVP: поле опционально, UI можно отложить |
| 9 | Бренд в копирайте | «Пользователь QHub Split» / «Локальный» / «Приглашение отправлено» |
| 10 | Reusable invite | Seat-bound: **одноразовый claim** |

### Ответы продукта A–D

| # | Вопрос | Решение |
| --- | --- | --- |
| A | Может ли local стать owner? | **Да.** У Participant с любым статусом (`local` / `pending_invite` / `connected`) может быть `role: owner` (передача владельца на локального seat до claim). Пока owner не connected: owner-only действия (курсы, архив) временно выполняют **connected**-участники комнаты. После claim owner’а — только он |
| B | Connected → снова Local? | **Нет** в MVP (только leave / soft). Detach — later |
| C | Второй девайс | **Вне MVP.** Пояснение: один человек открыл комнату на iPhone и хочет тот же seat на iPad/ноуте. Сейчас 1 `accessToken` на Participant. Не делаем в v5.1 (ни шаринг токена, ни re-claim). Позже — отдельное решение |
| D | Locals при создании комнаты | **После**, уже в комнате («Добавить участника») |

------------------------------------------------------------------------

## 5. API (черновик)

```text
POST   /api/split/rooms/:id/participants
       { displayName, avatarUrl? } → Participant(status=local)

PATCH  /api/split/rooms/:id/participants/:memberId
       { displayName?, avatarUrl? }  // local/pending; connected — своё имя?

POST   /api/split/rooms/:id/participants/:memberId/invite
       { channel: link|qr } → { token, joinPath, expiresAt }
       // status → pending_invite; invite bound to memberId

POST   /api/split/rooms/join
       body: { token, displayName? }
       // если invite.seatMemberId → claim seat (не создавать нового)
       // иначе legacy: создать нового connected member

DELETE /api/split/rooms/:id/participants/:memberId
       // только local без истории; иначе 409
```

Auth headers без изменений для actor.

Snapshot: у участников наружу — `status`, без `tokenHash`.

------------------------------------------------------------------------

## 6. UI

### Комната — секция «Участники»

- Список: имя + ненавязчивый статус
  - `connected` → «QHub Split»
  - `local` → «Локальный»
  - `pending_invite` → «Приглашение отправлено»
- Кнопка **Добавить участника** → имя (± аватар later)
- У local/pending: **Пригласить** → ссылка / QR (паттерн как сейчас, без NotAllowedError-ловушки iOS)
- Пикеры в расходе / погашении / кассе уже по `memberId` — locals появляются автоматически

### Create / join

- Create: без изменений по сути (owner connected)
- Join по seat-invite: экран «Войти как {name}» (displayName из seat по умолчанию, можно поправить)

------------------------------------------------------------------------

## 7. План фаз

### Phase 0 — Lock решений

- Утвердить §4 таблицу + ответы A–D.
- Спека claim: идемпотентность `clientMutationId` / повторный join тем же токеном.

### Phase 1 — Store + types

- `status`, optional `tokenHash`, `inviteSeatMemberId` на invitation.
- `addLocalParticipant`, `createSeatInvite`, `claimSeatJoin`.
- Миграция чтения: отсутствие `status` + наличие `tokenHash` ⇒ `connected`.
- Vitest: local → expense paidBy local → invite → claim → тот же memberId в балансах.

### Phase 2 — API

- Routes participants + расширенный join/invite.
- Guard: locals не могут быть actor; owner rules без изменений.

### Phase 3 — UI

- Список участников + add + invite seat-bound.
- Статусы в UI.
- Expense/settlement pickers без спец-режимов.

### Phase 4 — Hardening (после MVP)

- Avatars, merge seats, linkedUserId ↔ QHub account, leave API, multi-device.

------------------------------------------------------------------------

## 8. Что не делать в этом релизе

- Не заводить отдельный «локальный режим комнаты» / второй UX.
- Не мигрировать историю на новые id при connect.
- Не требовать QHub User registry для Connected MVP.
- Не смешивать с Offline First.
- Не hard-delete участников с ops.

------------------------------------------------------------------------

## 9. Критерии готовности MVP v5.1

- [ ] Owner создаёт комнату и добавляет 2+ local без invite
- [ ] Расход/погашение с local в paidBy/participants считаются как сейчас по id
- [ ] Invite local → claim: тот же `memberId`, история и балансы на месте
- [ ] В списке видны статусы local / pending / connected
- [ ] Ledger/advanced (v5) принимает local как custodian / payer
- [ ] Регресс: старые комнаты (все connected) работают без миграции данных
- [ ] Vitest: claim не создаёт второй seat

------------------------------------------------------------------------

## 10. Файлы (ориентир)

| Слой | Пути |
| --- | --- |
| Types / store | `src/lib/split/types.ts`, `store.ts`, `guard.ts`, `client.ts` |
| API | `.../rooms/[roomId]/participants/**`, `invite`, `join` |
| UI | `SplitRoomClient.tsx`, join/home при необходимости |
| Tests | `store.test.ts` + новые participant tests |
| Docs | этот план + TZ |

Engine/ledger: только строгая валидация «id ∈ room.memberIds» (желательно уже в Phase 1–2).

------------------------------------------------------------------------

## 11. Итог

v5.1 закрывает главный UX-разрыв текущего MVP: «нельзя вести учёт за семью, пока всех не пригласишь». Архитектурно это **разделение Participant и session**, а не новая финансовая модель.

**Деньги уже на Participant ids.** Нужно сделать tokenless seats + seat-bound claim.

**Следующий шаг:** ок по §4 / вопросам A–D → Phase 1 store.
