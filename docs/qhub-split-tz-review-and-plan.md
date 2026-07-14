# QHub Split — оценка ТЗ v3.3 (MVP) и план реализации

Источник: `QHub_Split_TZ_v3.3_MVP`. Заменяет оценку по v2.1.

## Статус реализации

**MVP online (фазы 1–4) — в коде:**

- `src/lib/split/engine` — Decimal, LRM, balance, greedy, lock (+ vitest)
- `src/lib/split/store` — Room Core Split-only + expenses/settlements (Redis/memory)
- `src/app/api/split/**` — rooms, invite, join, rates, expenses, balances, settlements, export, statistics
- `src/app/tools/split/**` — create/join/room UI, CSV export, catalog entry (`beta`)

**Ещё не сделано:** Offline First (фаза 5), binary attachments, dedicated Split icons, Messenger deep-link polish.

---

## 1. Вердикт

v3.3 **годится как рабочий MVP-spec**: есть границы scope, инварианты, greedy settle, Decimal + Largest Remainder, блокировка расходов после settlement, черновик API и критерии приёмки.

Главное архитектурное решение ТЗ: **Room Core создаётся вместе со Split и используется только Split** — снимает блокер «ждать общий Core для Family/Messenger».

Остаются уточнения до/во время фазы 1: Offline First (протокол синка), права ролей, семантика «связанных расходов», формат экспорта, ортогональность режимов 5.5/5.6 к 5.1–5.4.

**Статус относительно репо:** модулей `room-core` / `split` нет; ближайший паттерн — Family (`src/lib/family/`: Redis room + invite token + versioned poll).

---

## 2. Что закрыто относительно v2.1

| Тема | v3.3 |
| --- | --- |
| Room Core vs Split | Core только для Split, пишется параллельно |
| FX | Курсы задаёт владелец комнаты вручную; нет внешнего FX API в MVP |
| Алгоритм | Balance = Paid − Share; greedy creditors/debtors |
| Округление | Decimal + Largest Remainder |
| Блокировка | После первого DebtSettlement связанные расходы read-only; правки — корректирующими расходами |
| Инварианты | Σ balances = 0; leave с ненулевым балансом запрещён; archive = view-only |
| API | Room Core ops + REST Split endpoints |
| MVP out | OCR, itemized receipt, AI, maps, recurring, advanced analytics |
| Приёмка | Split methods + invariants + greedy + offline sync + export |

`ExchangeRate` как сущность убрана из §15 — курс живёт на уровне комнаты (таблица владельца) и снепшотится в расход (`exchangeRate`, `exchangeTimestamp`, `amountBase`).

---

## 3. Оставшиеся пробелы

### 3.1 Нужно зафиксировать до реализации sync

1. **Offline First** — что кэшируется локально, очередь мутаций, конфликт при `version` mismatch, кто выигрывает (server wins / last-write / merge), поведение при offline settlement, нарушающем долг.
2. **«Связанные расходы»** после DebtSettlement — все расходы комнаты или только те, что формируют долг пары `from→to`? Рекомендация: **все expenses комнаты lock на edit/delete** после любого settlement (проще инварианты); корректировки = новые expenses / reversing expenses.
3. **Роли (`RoomRole`)** — минимум: `owner` (курсы, archive, invite), `member` (CRUD expenses/settlements до lock), `viewer`? Кто может DELETE settlement.
4. **Auth / identity** для invite через Messenger + QR + link: phone session как Messenger, или Split-local member token как Family.
5. **Формат экспорта** — CSV/JSON/PDF; поля; язык; только base currency или originals тоже.
6. **5.5 и 5.6** — это модификаторы участник-сета поверх 5.1–5.4, а не отдельные methods. В модели: `splitMethod` ∈ {equal, fixed, percentage, shares} + `participantIds[]` (+ опция exclude payer = participantIds без payer).
7. **Attachments в MVP** — ТЗ включает поле вложений, OCR out. Нужен ли upload в MVP или поле отложить? Рекомендация: **отложить binary attachments**, оставить тип/API-заглушку, чтобы не раздувать offline sync.
8. **GET /statistics** vs «расширенная аналитика out» — для MVP: суммы по категориям/участникам в base currency достаточно; иначе убрать endpoint из MVP.

### 3.2 Важно, но можно решить в коде с разумными дефолтами

- Валидация fixed/percentage в `currencyOriginal` vs после FX в base (рекомендация: fixed в исходной валюте расхода, equality check до FX; percentage/shares — после нормализации в base с LRM).
- Частичные settlements; несколько settlements по одной паре.
- DELETE settlement → unlock expenses? Рекомендация: unlock только если **не осталось** ни одного settlement в комнате.
- Идемпотентность POST (clientMutationId) — особенно для offline.
- Precision Decimal (scale 2 для KZT/USD UI; внутренний scale ≥ 4).
- Geo optional — хранить lat/lng без карт UI.

---

## 4. Целевая модель (черновик реализации)

### Room Core (`src/lib/room-core/` или `src/lib/split/room/`)

```
Room: id, name, baseCurrency, rates[{currency, rate, updatedAt, updatedBy}],
      status: open|archived, ownerMemberId, version, createdAt, updatedAt
RoomMember: memberId, roomId, displayName, role, userRef?, joinedAt, leftAt?
RoomInvitation: token, roomId, role, channel: link|qr|messenger, expiresAt, createdBy
RoomEvent: (optional log) type, payload, at, actorId  // для sync/cursor
```

### Split (`src/lib/split/`)

```
Expense: id, roomId, description, amountOriginal, currencyOriginal,
         exchangeRate, exchangeTimestamp, amountBase, categoryId,
         paidByMemberId, splitMethod, participantIds[], comment?,
         geo?, locked: boolean, createdBy, createdAt, updatedAt, version,
         clientMutationId?
ExpenseParticipant: expenseId, memberId, inputValue (amount|%|shares), amountBase
DebtSettlement: id, roomId, fromMemberId, toMemberId, amountBase, date,
                comment?, createdBy, createdAt, clientMutationId?
Category: id, key|label (seed list)
Attachment: post-MVP / stub
ExpenseHistory: id, expenseId, at, actorId, op, patch
```

Баланс не персистить как source of truth — только derive + опциональный cache на `room.version`.

---

## 5. Engine (чистая логика)

1. `normalizeShares(expense, method, participants)` → `amountBase[]` с LRM, Σ = `amountBase`.
2. `computeBalances(expenses, settlements)` → net per member; assert Σ ≈ 0.
3. `suggestSettlements(balances)` → greedy pairs в base currency.
4. `assertSettlement(balances, from, to, amount)` — amount ≤ debt from→to (по net / по рекомендованной паре — зафиксировать: **amount ≤ min(−net[from], net[to])** при net[from]<0 и net[to]>0).
5. Lock policy helpers.

Стек: decimal.js (или equivalente); **запрет number для денег** в engine/API validation.

Vitest матрица: equal/fixed/%/shares × subset × exclude payer × FX × LRM × settlements × lock × leave guard × archive.

---

## 6. План фаз

### Фаза 0 — Уточнения (коротко, в ТЗ или ADR)

- Offline sync: server-wins + mutation queue + `clientMutationId`.
- Lock scope: вся комната после любого settlement.
- Roles: owner | member.
- Export: CSV (UTF-8) expenses + settlements + balances snapshot.
- Attachments: out of binary MVP (поле optional null).
- Auth: Family-like member accessToken + invite link/QR; Messenger invite = deep link / share URL в существующий messenger share flow где возможно.

### Фаза 1 — Domain engine

- `src/lib/split/engine/*` + тесты инвариантов.
- Без Redis/UI.

### Фаза 2 — Room Core (Split-only) + persistence

- Redis store: room, members, invites, rates, version bump.
- API: CreateRoom, InviteMember, JoinRoom, LeaveRoom, GetMembers, ArchiveRoom.
- Owner sets FX rates; rates apply only to new expenses.

### Фаза 3 — Split API

- Expenses CRUD с валидацией methods + lock rules.
- Balances, settlements suggest+POST+DELETE, export CSV.
- Statistics minimal или отложить endpoint.
- Idempotency + membership guards + rate limit.

### Фаза 4 — UI `/tools/split`

- Create/join (link + QR), room rates (owner), expense form (все methods MVP), list, balances + suggested settlements, mark settlement, archive view, export button.
- Manifest + catalog.
- Mobile-first.

### Фаза 5 — Offline First

- IndexedDB cache snapshot + outbox queue.
- Sync on reconnect against `room.version` / event cursor.
- Reject/replay mutations that break invariants; surface conflicts in UI.
- Acceptance: offline create expense → online sync preserves Σ balances = 0.

### Фаза 6 — Hardening / polish

- ExpenseHistory audit, correcting-expense UX, Messenger share invite, i18n ru.
- Push/poll sync как у Family (`version` poll) если WS не нужен.

---

## 7. Карта файлов

```
src/lib/split/
  types.ts
  constants.ts
  decimal.ts
  engine/{shares,balance,settle,lock,invariants}.ts
  engine/*.test.ts
  room/{store,invites,guard,session}.ts   # Room Core Split-only
  store.ts                                 # expenses, settlements
  export/csv.ts
  sync/{outbox,apply}.ts                   # offline
  client.ts
src/app/api/split/**                       # rooms + expenses + …
src/app/tools/split/**
public/tools/split/manifest.json
```

Rooms API можно держать под `/api/split/rooms/*`, а «Room Core» — как lib-слой, не отдельный публичный продукт.

---

## 8. Критерии готовности (из ТЗ + операционализация)

- [ ] equal / fixed / percentage / shares + selected participants + exclude payer
- [ ] Σ member balances = 0 на каждом fixture
- [ ] Σ shares = amountBase (LRM)
- [ ] Greedy suggestions только в base currency
- [ ] Settlement ≤ текущий долг; после settlement expenses locked; correcting expense path работает
- [ ] Leave запрещён при ненулевом net; archive = read-only
- [ ] FX owner-defined; old expenses immutable по курсу
- [ ] Export выдаёт файл с расходами/погашениями/балансом
- [ ] Offline outbox sync не нарушает инварианты (интеграционный тест)
- [ ] Нет платежных реквизитов / статусов банка в модели и UI

---

## 9. Риски

| Риск | Митигация |
| --- | --- |
| Offline First в том же MVP, что и полный split matrix | Сначала online-correct engine+API+UI, затем offline как отдельная фаза с тем же DoD |
| Lock «связанных» расходов неоднозначен | Lock всей комнаты |
| Messenger invite тянет связность с messenger auth | Deep link на Split join; не требовать полного messenger identity в MVP |
| Binary attachments + offline | Вынести из MVP |

---

## 10. Итог

v3.3 — **зелёный свет на реализацию** с оговоркой: Offline First и вложения не должны блокировать фазы 1–4. Рекомендуемый порядок: **engine → Room Core Split-only → API → UI → offline → export/hardening**. Юридически формулировка «не платёжка» и Decimal-инварианты остаются жёсткими требованиями.
