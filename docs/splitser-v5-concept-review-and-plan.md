# Splitser v5.0 — оценка концепции и план миграции

Источник: концепт «финансовая модель комнаты» (Operation ledger + активы).
Текущий прод: QHub Split MVP по ТЗ v3.3 (`Expense` + `DebtSettlement`, без активов комнаты).

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

## 3. Пробелы (нужно зафиксировать до кода)

### 3.1 Критично

1. **Инварианты активов**
   - Σ движений по активу = остаток?
   - Отрицательный баланс актива запрещён?
   - Что если Expense из кассы больше остатка?

2. **Двойная запись**
   - Нужна ли явная проводка `debit/credit` на счетах (member equity + asset), или деривация из типов операций достаточна?

3. **Формула member balance**
   Явно прописать вклад каждого типа:

   | Операция | Эффект на member net |
   | --- | --- |
   | Expense (source=member M) | M += amountBase; participants −shares |
   | Expense (source=asset) | только participants −shares; актив −amount (equity комнаты?) |
   | Contribution (M → asset) | M += amount (кредитор комнаты) |
   | Withdrawal (asset → M) | M −= amount |
   | Settlement (A → B) | A += amount; B −= amount |
   | Transfer / Exchange | member nets без изменений |
   | Adjustment | по полям |

   Особенно спорен **Expense из кассы**: уменьшает актив и начисляет доли участникам — кто «кредитор»? Обычно: касса = общий пул; доли уменьшают equity участников относительно пула / или появляется «room equity». Это надо выбрать одной моделью.

4. **Модель «equity комнаты»**
   - Вариант A: только member balances; касса — буфер, взносы увеличивают net внёсшего.
   - Вариант B: отдельный счёт `room` / `pool`.
   - Рекомендация для MVP v5: **A** (проще): Contribution даёт +net внёсшему; Expense из кассы списывает актив и распределяет доли (−share участникам), без отдельного room-member. Проверка: Σ member nets + ? = f(assets). Нужен явный инвариант «закрытия комнаты».

5. **FX**
   - Курсы владельца остаются для Expense в чужой валюте?
   - Exchange — отдельная фиксация фактической конвертации активов (rate implied)?
   - Не смешивать «курс на расход» и «обмен активов».

6. **Lock / audibility**
   - v3.3: после Settlement expenses lock.
   - v5: lock всего ledger? только прошлых операций? soft correction via Adjustment?

7. **«Позиции чека»** — в v3.3 out of MVP; в v5 снова в списке split methods. Оставить post-MVP.

### 3.2 Важно

8. Типы активов: cash/bank/card/wallet — поля, мультивалютность одного актива или 1 asset = 1 currency?
   - Рекомендация: **1 asset = 1 currency** (проще Exchange как 2-leg).
9. Права: кто создаёт Contribution/Exchange/Asset?
10. Offline First уже отложен — с ledger становится ещё важнее (идемпотентность операций).
11. Миграция существующих Redis `split:expense:*` / settlements.
12. Переименование продукта Splitser vs QHub Split — только бренд/UI или path `/tools/split`?

------------------------------------------------------------------------

## 4. Целевая модель данных (черновик)

```text
RoomAsset
  id, roomId, name, kind: cash|bank|card|wallet|other,
  currency, balanceBase? (derived) / balanceNative,
  createdAt

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
  fromAssetId, toAssetId, amount, currency  // same currency

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

## 9. Вопросы владельцу

1. Модель equity при расходе из кассы — вариант A (только member nets) или B (счёт комнаты)?
2. Можно ли уводить актив в минус?
3. Contribution всегда в актив или можно «на руки организатору» без asset?
4. Переименовываем продукт в Splitser в UI или оставляем QHub Split?
5. Advanced mode default off для всех комнат?

------------------------------------------------------------------------

## 10. Итог

v5.0 — **следующий правильный слой** над текущим Split, а не замена продуктовой идеи. Текущий MVP валиден как «простой режим». Следующий инженерный шаг: **спека инвариантов + ledger engine с регрессом v3.3**, затем активы и advanced UI.
