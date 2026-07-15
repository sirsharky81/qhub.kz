# Splitser v5.0 — оценка концепции и план миграции

Источник: концепт «финансовая модель комнаты» (Operation ledger + активы).
Текущий прод: QHub Split MVP по ТЗ v3.3 (`Expense` + `DebtSettlement`, без активов комнаты).

## Статус реализации

**Phase 1 (ledger engine) — в коде:**

- `src/lib/split/ledger/` — типы ops/assets, `foldLedger`, legacy adapter
- Инвариант модели A: `Σ member nets (base) === Σ asset balances (base)`
- Запрет отрицательного остатка актива
- Custodian обновляется через `custody_handoff`
- Vitest: регресс v3.3 + contribution/cash/withdrawal/transfer/handoff

**Phase 2 (persistence + API) — в коде:**

- `src/lib/split/ledger-store.ts` — assets/ops Redis, merge legacy expenses/settlements
- API: `GET/POST .../assets`, `GET .../ledger`, `GET/POST .../operations`
- Client: `apiGetLedger`, `apiCreateAsset`, `apiCreateOperation`
- `room.advancedAccounting` включается при первом активе/advanced-op
- Vitest store flow: 22 tests total in `src/lib/split`

**Phase 3 (UI advanced) — в коде:**

- `SplitAdvancedPanel.tsx` — активы (остатки + custodian), создание актива, взнос, расход из кассы, журнал операций
- `SplitRoomClient.tsx` — toggle «Расширенный учёт» (off by default, auto-on при `room.advancedAccounting`), `refresh` + `apiGetLedger`

**Ещё не сделано:** полный dual-write legacy→ops, offline.

------------------------------------------------------------------------

## 0. Зафиксированные решения продукта

| # | Вопрос | Решение |
| --- | --- | --- |
| 1 | Equity при расходе из кассы | **Вариант A** — только member nets, без отдельного счёта «комнаты» |
| 2 | Отрицательный остаток актива | **Запрещён** (операция отклоняется) |
| 3 | Куда идёт взнос | **Всегда в актив**. У актива есть **ответственный участник (custodian)** — деньги «у кого-то», не «в тумбочке». В UI видно: общий объём активов + сколько у кого на руках |
| 4 | Имя продукта | **QHub Split** (не переименовывать в Splitser) |
| 5 | Advanced mode | **Выключен по умолчанию** (progressive disclosure, как в аналогах). Включается вручную *или* автоматически при первом взносе/создании актива. Простой UX = Расход + Погашение |

### Уточнение по активам (п.3)

```text
RoomAsset
  id, roomId, name, kind, currency,
  custodianMemberId   // кто отвечает / держит сумму
  // balance — только derived из ledger
```

Пример UI:

```text
Активы комнаты          120 000 KZT
  у Бориса (касса)       85 000
  у Ивана (наличка)      35 000
```

Смена ответственного = отдельная операция (handoff / transfer custody) или Transfer между двумя активами одного currency с разными custodian — зафиксировать в Phase 0 спеке engine.

### Почему так по п.5 (опыт аналогов)

Splitwise и UX-кейсы bill-split держат **простой поток «добавить расход»** на первом плане; сложное — progressive disclosure. Касса/взносы — сценарий поездки с общим котлом, не каждой комнаты. Значит:

- новая комната стартует в простом режиме;
- блок «Активы / Взнос / Обмен» появляется после включения advanced или после первого Contribution;
- не спрашивать пользователя про «расширенный учёт» при создании комнаты.

------------------------------------------------------------------------

## 1. Вердикт

Концепция **сильная и правильная** как целевая архитектура: журнал операций (ledger) вместо списка расходов лучше описывает поездки/коммуналку с общей кассой и валютами.

Для текущего кода это **не патч**, а **смена доменной модели**:

| Сейчас (v3.3) | Цель (v5.0) |
| --- | --- |
| Expense + Settlement | Operation + подтипы |
| `paidByMemberId` | `paymentSource` (member **или** asset) |
| Нет активов | `RoomAsset` с остатками |
| Баланс = paid − share ± settlements | Баланс из полного журнала операций |
| FX: курсы владельца на расход | + операция Exchange между активами |
| История = расходы | Единая лента операций |

**Рекомендация:** не ломать простой UX. По умолчанию UI = Расход + Погашение (как сейчас). «Расширенный учёт» включает взносы/активы/обмен/изъятие/переводы. Движок сразу строить вокруг Operations, даже если UI показывает два типа.

Текущий MVP **оставить живым**; v5 внедрять поверх с миграцией данных Expense/Settlement → Operation.

------------------------------------------------------------------------

## 2. Что хорошо в v5.0

1. **Expense — частный случай Operation** — чистая модель для роста.
2. **Источник оплаты ≠ потребитель** — критично для оплаты «из кассы».
3. **Активы комнаты** — закрывают реальный сценарий «собрали кучу в кассу → тратим».
4. **Contribution / Withdrawal** — объясняют, откуда у кассы деньги и куда ушли.
5. **Transfer / Exchange** не трогают member balances — правильное разделение.
6. **Простой UI + advanced** — обязательный продуктовый предохранитель.

------------------------------------------------------------------------

## 3. Пробелы (оставшиеся после решений §0)

### Закрыто решениями §0

- Equity модель → **A**
- Минус актива → **запрет**
- Contribution → **всегда в актив + custodian**
- Бренд → **QHub Split**
- Advanced → **off by default + auto-on при первом asset/contribution**

### Ещё нужно в Phase 0 спеке (до engine)

1. **Численный инвариант закрытия комнаты** при модели A + активы с custodian (fixtures в тесты).
2. **Expense из кассы** при A: актив −amount; participants −shares; member nets без «+paid» источнику-активу. Проверить Σ nets vs сумма активов.
3. **Двойная запись** — достаточно fold по типам ops (без отдельной GL-таблицы) для MVP v5.
4. **FX:** курсы владельца для Expense; Exchange — implied rate между активами; не смешивать.
5. **Lock:** после Settlement — как сейчас; Adjustment для правок.
6. **Handoff custodian** — отдельный op type или reuse Transfer.
7. **Receipt items** — post-MVP.
8. **1 asset = 1 currency** (рекомендация остаётся).
9. Миграция Redis expense/settlement → Operation.
10. Offline — отдельным релизом после online ledger.

------------------------------------------------------------------------

## 4. Целевая модель данных (черновик)

```text
RoomAsset
  id, roomId, name, kind: cash|bank|card|wallet|other,
  currency,                // 1 asset = 1 currency
  custodianMemberId,       // кто держит / отвечает
  createdAt
  // balanceNative — только derived из ledger

Operation (base)
  id, roomId, type, createdAt, createdBy, comment?,
  clientMutationId?, locked?

ExpenseOp
  amount, currency, exchangeRate?, amountBase, categoryId,
  paymentSource: { kind: member|asset, id },
  splitMethod, participants[]

ContributionOp
  fromMemberId, toAssetId, amount, currency, amountBase

SettlementOp
  fromMemberId, toMemberId, amountBase   // как сейчас DebtSettlement

TransferOp
  fromAssetId, toAssetId, amount, currency  // same currency; может менять custodian косвенно

CustodyHandoffOp   // опционально: смена custodian без смены остатка / или через Transfer
  assetId, fromMemberId, toMemberId

WithdrawalOp
  fromAssetId, toMemberId, amount, currency, amountBase

ExchangeOp
  fromAssetId, fromAmount, toAssetId, toAmount  // implied rate

AdjustmentOp
  patches: memberDeltas[] and/or assetDeltas[], reason
```

Engine:

1. replay operations in order → asset balances + member nets  
2. assert invariants (Σ nets related to assets per chosen model)  
3. greedy suggestions as now on member nets  
4. Decimal + LRM без изменений для shares  

------------------------------------------------------------------------

## 5. Совместимость с текущим MVP

Существующее отображается как:

- `Expense` → `Operation.type=expense`, `paymentSource=member(paidBy)`
- `DebtSettlement` → `Operation.type=settlement`
- Room FX rates → остаются для новых expense в чужой валюте; Exchange — отдельный путь

UI без advanced: фильтр ленты `expense|settlement` — пользователи не видят сдвиг модели.

------------------------------------------------------------------------

## 6. План внедрения

### Фаза 0 — Спека (блокер)

- Зафиксировать инварианты member/asset (таблица эффектов + численные fixtures).
- Правило Expense из кассы.
- 1 asset = 1 currency.
- Scope: Income / receipt items — out.

### Фаза 1 — Ledger engine (pure TS)

- Типы Operation + fold → balances/assets.
- Vitest сценарии:
  - взнос → расход из кассы → балансы;
  - личный расход + settlement (регресс v3.3);
  - exchange не двигает nets;
  - withdrawal;
  - Σ инвариант закрытия.
- Пока без UI.

### Фаза 2 — Persistence / API

- `split:op:*` журнал; assets CRUD.
- Адаптеры: старые expenses/settlements читаются как ops **или** one-shot migrate.
- API: `POST /operations`, `GET /ledger`, `GET /assets`, balances derived.

### Фаза 3 — UI

- Лента операций (вместо только расходов).
- Форма расхода: источник = участник | актив.
- Toggle «Расширенный учёт»: взнос, изъятие, перевод, обмен.
- Активы: блок остатков.
- Settlement — как сейчас.

### Фаза 4 — Hardening

- Lock/Adjustment policy, export ledger CSV, offline outbox на ops.
- Убрать legacy write paths.

------------------------------------------------------------------------

## 7. Что не делать сейчас

- Не переписывать UI целиком до Phase 1 fixtures.
- Не тащить OCR / позиции чека в v5.0-core.
- Не смешивать v5 с Offline First в одном релизе.
- Не делать платёжный шлюз: Settlement/Contribution — **факт**, не банк (как v3.3).

------------------------------------------------------------------------

## 8. Критерии готовности v5 MVP

- [ ] Личный расход + settlement = прежнее поведение v3.3
- [ ] Взнос в кассу + расход из кассы корректно двигают активы и nets
- [ ] Transfer/Exchange не меняют member nets
- [ ] История — единый ledger
- [ ] Простой режим UI скрывает advanced ops
- [ ] Decimal/LRM/greedy зелёные на матрице тестов
- [ ] Миграция существующих комнат без потери балансов

------------------------------------------------------------------------

## 9. Вопросы — закрыты

См. §0. Открытыми остаются только технические детали Phase 0 (инвариант закрытия + custodian handoff), не продуктовые fork'и.

------------------------------------------------------------------------

## 10. Итог

v5.0 — **следующий правильный слой** над текущим Split. Решения §0 разблокируют engine: модель A, без минусов актива, активы с custodian, бренд QHub Split, advanced off by default.

**Следующий шаг разработки:** Phase 1 — ledger engine + fixtures (регресс v3.3 + взнос/касса/custodian).
