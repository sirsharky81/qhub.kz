# QHub Split — оценка ТЗ v2.1 и план реализации

Источник: `QHub_Split_TZ_v2.1` (обновление: не платёжная система, `DebtSettlement` вместо Transfer).

## 1. Вердикт

ТЗ хорошо задаёт **продуктовую границу** и **ядро домена** (расходы → доли → баланс → погашение), но для старта разработки **неполно**: нет схемы полей, API, ролей/прав, UI-экранов, NFR и определения MVP vs post-MVP.

В текущем репозитории QHub **нет модуля Room Core** и **нет Split**. Комнаты уже есть у Family и Messenger — каждая со своей Redis-моделью. Без решения по Room Core Split либо блокируется, либо вынужденно копирует room-паттерн Family.

**Рекомендация:** уточнить пробелы ниже, затем идти фазами: каноничный движок расчёта → MVP Split с минимальной room-оболочкой → вынос/подключение Room Core → медиа/статистика.

---

## 2. Что сильно в ТЗ

| Пункт | Почему важно |
| --- | --- |
| Явный отказ от статуса платёжной системы | Снимает compliance-scope: нет карт, реквизитов, статусов банковских переводов |
| `DebtSettlement` вместо Transfer | Фиксирует «факт договорённого погашения», а не платёж |
| Валюта комнаты + курс на момент расхода | Избегает хаоса пересчёта задним числом |
| Разделение: equal / fixed / % / shares / subset / exclude payer | Покрывает типовые сценарии Splitwise-класса |
| Разрез Room Core vs Split | Правильное разделение ответственности, если Core реально появится |

---

## 3. Пробелы и риски (нужны решения до кода)

### 3.1 Критично

1. **Room Core не существует в codebase.** Зависимость §9/§10 некуда цеплять. Варианты:
   - A) сначала общий `room-core` (Room, Member, Role, Invitation, sync/events);
   - B) MVP Split со своей room-оболочкой по образцу Family (`src/lib/family/`), позже миграция на Core;
   - C) переиспользовать Messenger room — спорно (другой auth/модель/TTL).
2. **Нет схемы полей сущностей.** Перечислены имена (`Expense`, `ExpenseShare`, …), но не типы, обязательность, инварианты, индексы, TTL.
3. **Алгоритм баланса и settle graph не специфицирован.** Нужны: net balance per member, минимизация платежей (greedy / pairwise), rounding, кто «должен» при симметричных долгах.
4. **Инварианты разделения.** Что если % ≠ 100, fixed sums ≠ total, доли = 0, плательщик не в участниках, участник вышел из комнаты после расходов.
5. **Права и роли.** Кто создаёт/правит/удаляет расход, кто отмечает settlement, может ли чужой settlement подтвердить только кредитор, soft-delete vs hard-delete.
6. **Идемпотентность и concurrent edits.** Два участника правят один расход → как версионировать и пересчитывать баланс.
7. **Статус «Расчеты завершены».** Кто/что выставляет, обратимость при новом расходе, хранение статуса на Room или в Split-агрегате.

### 3.2 Важно

8. **Auth.** Phone/session как Messenger, token как Family, или гостевые invite-links без аккаунта.
9. **Курсы.** Источник API, кэш `ExchangeRate`, список валют MVP, ручной override, точность округления (тг vs дробные).
10. **Attachments.** Где хранить фото чеков (диск/S3/локально), лимиты, EXIF/geo privacy.
11. **ExpenseHistory.** Что логируется, UI истории, хранение vs audit-only.
12. **Realtime.** «Синхронизация» и «события комнаты» — poll (Family) vs WS (Messenger); для Split достаточно versioned poll на MVP.
13. **Категории.** Системный набор vs custom per room; мультиязычность каталога.
14. **Статистика.** Вне MVP или минимальный отчёт (сумма по категориям / участникам).

### 3.3 Продуктовые краевые случаи

- Удаление участника с ненулевым балансом.
- Правка/удаление расхода после settlement.
- Частичное погашение и несколько settlements по одной паре.
- Отрицательные/нулевые суммы, валютный mismatch settlement vs room currency.
- Офлайн/повторная отправка формы (нужен client mutation id).

---

## 4. Соответствие текущему QHub

| Ожидание ТЗ | Факт в репо |
| --- | --- |
| Room Core | Нет общего модуля |
| Split tool `/tools/…` | Нет |
| Паттерн multi-user room + Redis | Есть: Family (`src/lib/family/`), Messenger, Hearts/Lotto |
| Фото/вложения | Сканеры и Capacitor camera — можно опереться позже |
| Гео | Family geo — опционально для expense geo |
| Каталог tools + manifest | Стандартный путь регистрации инструмента |

Практичный путь MVP: зеркало Family — `src/lib/split/` + `src/app/tools/split/` + Redis keys + session/invite, **без ожидания полного Room Core**.

---

## 5. Предлагаемая модель данных (черновик для уточнения ТЗ)

### Room Core (или локальная оболочка MVP)

- `SplitRoom`: `roomId`, `name`, `baseCurrency`, `status` (`open` \| `settled`), `ownerId`, `memberIds`, `version`, `createdAt`, `updatedAt`
- `SplitMember`: `memberId`, `roomId`, `displayName`, `role` (`owner` \| `member` \| `viewer`), `userRef?`, `joinedAt`
- `SplitInvitation`: `token`, `roomId`, `role`, `expiresAt`, `createdBy`

### Split domain

- `Expense`: `id`, `roomId`, `description`, `amountOriginal`, `currencyOriginal`, `fxRateToRoom`, `amountRoom`, `categoryId`, `paidByMemberId`, `splitMethod`, `date`, `comment?`, `geo?`, `createdBy`, `createdAt`, `updatedAt`, `version`
- `ExpenseShare`: `expenseId`, `memberId`, `shareValue` (смысл зависит от method: amount / percent / parts), `amountRoom` (каноническая доля после нормализации)
- `DebtSettlement`: `id`, `roomId`, `fromMemberId`, `toMemberId`, `amount`, `currency`, `amountRoom`, `date`, `comment?`, `createdBy`, `createdAt`
- `Category`: `id`, `key` \| custom `label`, `roomId?`
- `ExchangeRate`: `base`, `quote`, `rate`, `asOf`, `source` (`system` \| `manual`)
- `Attachment`: `id`, `expenseId`, `mime`, `size`, `storageKey`, `createdAt`
- `ExpenseHistory`: `id`, `expenseId`, `at`, `actorId`, `op`, `patch`

Баланс **не хранить как primary source of truth** — вычислять из expenses + settlements; опционально кэш `BalanceSnapshot` на `room.version`.

---

## 6. Канонический алгоритм (ядро продукта)

1. Для каждого `Expense` нормализовать `ExpenseShare[]` → доли в валюте комнаты; сумма долей = `amountRoom` (правила rounding: largest remainder).
2. Net: для плательщика `+amountRoom`, для каждого share-участника `-share.amountRoom`.
3. Применить settlements: `from -= amountRoom`, `to += amountRoom` (в знаке «долговой» модели: погашение уменьшает долг from→to).
4. Построить минимальный набор рекомендованных погашений из net balances (жадный settle: самые отрицательные ↔ самые положительные).
5. `status = settled`, когда все \|net\| < epsilon (например 0.01 в base currency) **и** нет незакрытых расхождений rounding — либо явная кнопка владельца при нулевых nets.

Unit-тесты обязательны на equal/fixed/%/shares/subset/exclude-payer + multi-currency + partial settlements.

---

## 7. План работ по фазам

### Фаза 0 — Доработка ТЗ (без кода)

- Зафиксировать вариант Room Core: A / B / C (рекомендуется **B** для скорости).
- Добавить в ТЗ: поля сущностей, инварианты split, rounding, права, auth, MVP-границы.
- Acceptance checklist: сценарии «поездка 3 человека / 2 валюты / частичное погашение».

### Фаза 1 — Domain engine (pure TS)

- `src/lib/split/engine/`: normalize shares, net balance, suggest settlements, room status.
- Vitest: матрица методов разделения + FX lock + settlements.
- Без UI и без Redis.

### Фаза 2 — Persistence + API MVP

- Redis store (как Family): rooms, members, invites, expenses, shares, settlements.
- API: create/join room, CRUD expense, list balance, create settlement, room snapshot poll by `version`.
- Auth: invite token + session cookie/header (упрощённо Family-like).
- Base currency + manual FX; system rate stub/optional.

**MVP scope (вкл.):** equal + fixed + percent + shares; subset + exclude payer; balance + suggest; DebtSettlement; room status settled.

**MVP out:** receipts photos, geo, rich stats, ExpenseHistory UI, custom categories editor (достаточно seed-списка).

### Фаза 3 — UI tool

- `/tools/split`: create/join, room home (balance summary), expense form, expense list, settlements screen, mark settled.
- Manifest + catalog entry + i18n (ru минимум).
- Mobile-first, без карточного спама в hero; один primary CTA «Добавить расход».

### Фаза 4 — Hardening

- Permissions, validation, rate limits, idempotency keys.
- Concurrent edit via `version` / optimistic conflict.
- History audit log (server-side) for edits/deletes.
- Soft-delete expenses with balance recalc.

### Фаза 5 — Post-MVP

- Attachments (чеки), geo optional.
- System FX provider + `ExchangeRate` cache.
- Statistics.
- Вынос общей room-модели в `room-core` и миграция Split (и позже Family) — только если появится второй потребитель с теми же требованиями.

---

## 8. Рекомендуемый порядок реализации файлов

```
src/lib/split/
  types.ts
  constants.ts
  engine/{shares,balance,settle,fx}.ts
  engine/*.test.ts
  store.ts
  session.ts
  guard.ts
  client.ts
src/app/api/split/...
src/app/tools/split/...
public/tools/split/manifest.json
```

---

## 9. Критерии готовности MVP

- Комната создаётся, участники входят по invite.
- Расход во всех 4 основных методах split корректно ложится в balance.
- FX: сумма в валюте комнаты фиксируется и не плывёт при смене курса.
- Settlement уменьшает долг; UI показывает «кто кому»; при нулевых nets — «Расчеты завершены».
- Нет полей способа оплаты / карт / банковских статусов в API и UI.
- Unit-тесты engine зелёные; ручной checklist из 5 сценариев пройден.

---

## 10. Вопросы владельцу продукта (блокер списка)

1. Room Core сначала или Split со своей оболочкой (рекомендация: своя оболочка)?
2. Обязательна ли авторизация через Messenger phone, или достаточно display name + invite link?
3. Список валют и источник курса для MVP?
4. Кто имеет право удалять чужой расход / чужой settlement?
5. Нужны ли чеки и geo в первом релизе или явно post-MVP?

---

## 11. Итог

ТЗ v2.1 **годится как продуктовый манифест**, но **не как spec для кодинга** без §полей/инвариантов/MVP-границ. Самый дешёвый путь в текущем QHub: **вынести и покрыть тестами engine**, поднять **Family-like room MVP**, отложить Room Core и медиа. Юридически/продуктово формулировка «не платёжка + DebtSettlement» — правильная и должна остаться жёстким инвариантом API.
