# Gap-чеклист: Этап 1 — наблюдаемость звонилки QHub Messenger

> Дополнение к **ТЗ-аддендум v3.0** (стабилизация звонилки).  
> Цель этапа: **видеть реальные переходы и нарушения** в текущем коде, **не меняя** lifecycle, guard'ы, cleanup и ownership.

**Текущее состояние кодовой базы:** до Этапа 1. Центральный оркестратор — `CallController` (`src/lib/messenger/call/call-controller.ts`), не `CallEngine`.

---

## Принципы Этапа 1

| Можно | Нельзя |
|---|---|
| Добавить новые файлы-наблюдатели | Менять порядок `cleanup()` |
| Вставить `journal.record()` / `assertInvariants()` | Менять условия переходов `patch({ phase })` |
| Добавить кнопку экспорта в debug panel | Создавать `CallEngine` / reducer |
| Логировать `IGNORED_EVENT` там, где уже есть `return` | Объединять polling-петли |
| `console.warn` при нарушении инварианта в dev | Блокировать звонок при assert |

---

## 1. Новые файлы

### `src/lib/messenger/call/call-journal.ts`

**Роль:** структурированный Event Journal (§7 ТЗ-аддендума).

```ts
// Минимальный контракт
export type CallJournalEventType =
  | "INITIATE" | "CREATE_PC" | "OFFER_SENT" | "ANSWER_RECEIVED"
  | "ICE_CONNECTING" | "ICE_CONNECTED" | "ICE_DISCONNECTED" | "ICE_FAILED" | "ICE_RESTART_ATTEMPT"
  | "TRACK_REMOTE" | "CALL_STATE" | "IGNORED_EVENT" | "UNEXPECTED_EVENT"
  | "HANGUP" | "DECLINE" | "CLEANUP_START" | "CLEANUP_STEP" | "CLEANUP_COMPLETE"
  | "INVARIANT_VIOLATION" | "POLL_TICK" | "SIGNAL_RECEIVED";

export interface CallJournalEntry {
  seq: number;           // монотонный #001, #002…
  elapsedMs: number;     // от callStartedAt, не Date.now() для сортировки
  callId: string | null;
  sessionId: string;     // новый UUID на каждый setupPeerConnection()
  peerPhone: string | null;
  type: CallJournalEventType;
  detail?: string;
  meta?: Record<string, string | number | boolean | null>;
}

export class CallJournal {
  record(type, detail?, meta?): void;
  exportText(): string;   // формат как в ТЗ §7
  exportJson(): string;
  clear(): void;
  getEntries(): readonly CallJournalEntry[];
}
```

**Правила:**

- `seq` — счётчик внутри звонка, не timestamp (на iOS timestamp ненадёжен).
- `sessionId` — новый при каждом `setupPeerConnection()` (корреляция polling + reconnect + push).
- `elapsedMs` — `Date.now() - callStartedAt` из контроллера.
- Лимит ~500 записей, ring buffer.
- Singleton на звонок, сброс в `reset()`.

**Референс в кодовой базе:** паттерн из `src/lib/audioDebug.ts` (`exportAudioDebugBundle`) + формат из `src/lib/debug-agent-log.ts` (`sessionId`, ring buffer).

**Пример экспорта (целевой формат):**

```text
#001  00:00.0  callId=abc123 sessionId=s-9f2 peer=userB  INITIATE
#002  00:00.2  callId=abc123 sessionId=s-9f2              CREATE_PC
#003  00:00.2  callId=abc123 sessionId=s-9f2              OFFER_SENT
#004  00:02.1  callId=abc123 sessionId=s-9f2              ICE_CONNECTING
#005  00:02.8  callId=abc123 sessionId=s-9f2              ANSWER_RECEIVED
#006  00:03.0  callId=abc123 sessionId=s-9f2              TRACK_REMOTE
#007  00:03.1  callId=abc123 sessionId=s-9f2              CALL_STATE: connecting → active
#011  00:35.0  callId=abc123 sessionId=s-9f2              IGNORED_EVENT: ACCEPT (state=active)
#012  00:40.0  callId=abc123 sessionId=s-9f2              HANGUP (local)
#013  00:40.1  callId=abc123 sessionId=s-9f2              CLEANUP_START
#014  00:40.3  callId=abc123 sessionId=s-9f2              CLEANUP_COMPLETE
#015  00:40.3  callId=abc123 sessionId=s-9f2              CALL_STATE: * → ended
```

---

### `src/lib/messenger/call/call-invariants.ts`

**Роль:** runtime-проверки §5 ТЗ (только warn, не throw).

```ts
export interface InvariantContext {
  phase: CallPhase;
  callId: string | null;
  hasPeerConnection: boolean;
  hasLocalStream: boolean;
  hasRemoteTrack: boolean;
  iceConnectionState: string | null;
  polling: boolean;       // pollTimer !== null
}

export function checkCallInvariants(ctx: InvariantContext): string[]; // список нарушений
```

**Маппинг фаз → инварианты (адаптировано под текущий код, не под идеал ТЗ):**

| `CallPhase` | Проверять | Ожидаемое нарушение в текущем коде |
|---|---|---|
| `idle` | `!pc`, `!localStream`, `!callId`, `!polling` | — |
| `outgoing` / `incoming` | `callId !== null` | `pc !== null` у caller в `outgoing` ⚠️ |
| `connecting` | `pc`, `callId`, `localStream` | — |
| `active` | `pc`, `callId`, `localStream`, `hasRemoteTrack`, ICE connected | ранний `active` без track ⚠️ |
| `ended` | `!pc`, `!localStream` | возможно до `reset()` через 2.5с ⚠️ |

**Важно:** на Этапе 1 инварианты **фиксируют текущее поведение + помечают расхождения с ТЗ** отдельным полем `tzGap: true` в meta — чтобы не путать «баг сейчас» и «цель миграции».

---

### `src/lib/messenger/call/call-observability.ts` (опционально, тонкий фасад)

```ts
export function isCallObservabilityEnabled(): boolean;
export function getCallJournal(): CallJournal;
```

**Включение:**

- `NODE_ENV === "development"`, **или**
- `localStorage.getItem("qhub_call_journal") === "1"` (для диагностики на проде по запросу пользователя).

---

## 2. Изменения в существующих файлах

### `src/lib/messenger/call/types.ts`

**Добавить** (не менять существующие типы):

```ts
export type TransportPhase =
  | "new" | "offer_sent" | "answer_received"
  | "ice_connecting" | "ice_connected" | "ice_disconnected" | "ice_failed" | "closed";
```

На Этапе 1 `TransportPhase` живёт **только в journal**, не в reducer и не в `CallState`.

---

### `src/lib/messenger/call/call-controller.ts`

Единственный файл с бизнес-хуками. Все вставки — **observability-only**.

#### 2.1. Поля класса

```ts
private journal = new CallJournal();
private transportPhase: TransportPhase = "new";
private setupSessionId: string | null = null;
```

#### 2.2. Хуки — таблица точек вставки

| Место | Строка ~ | Событие journal | Invariant check |
|---|---|---|---|
| `patch()` — при смене `phase` | 383–403 | `CALL_STATE: prev → next` | ✅ после patch |
| `startOutgoing()` — вход | 211 | `INITIATE` (outgoing) | guard: `isInCall()` → `IGNORED_EVENT` |
| `startOutgoing()` — после `initiateCall` | 236 | — | — |
| `startOutgoing()` — перед `setupPeerConnection` | 256 | — | — |
| `setupPeerConnection()` — вход | 479 | `CREATE_PC`, новый `sessionId` | — |
| `setupPeerConnection()` — после `createOffer` | 257 | `OFFER_SENT` | `transportPhase = offer_sent` |
| `acceptIncoming()` — вход | 272 | — | `phase !== incoming` → `IGNORED_EVENT` |
| `acceptIncoming()` — `patch connecting` | 278 | `CALL_STATE` | ✅ |
| `rejectIncoming()` — вход | 303 | `DECLINE` | — |
| `hangup()` — вход | 311 | `HANGUP` | `!callId` → `IGNORED_EVENT` |
| `applyRemoteAnswer()` | 572 | `ANSWER_RECEIVED` | — |
| `applyRemoteOffer()` | 600 | offer side | — |
| `handlePeerConnected()` | 761 | `CALL_STATE → active` | ✅ строгая TZ-проверка как meta-warning |
| PC `onIceConnectionState` | 510 | `ICE_*` по state | обновить `transportPhase` |
| PC `onRemoteTrack` | 521 | `TRACK_REMOTE` | — |
| `handleSignal()` — каждый type | 1041 | `SIGNAL_RECEIVED` | guard-ветки → `IGNORED_EVENT` |
| `pollOnce()` — начало | 821 | `POLL_TICK` (throttle: раз в 5с) | — |
| `cleanup()` — вход | 1162 | `CLEANUP_START` | — |
| `cleanup()` — после каждого шага | 1171–1206 | `CLEANUP_STEP: stopPolling` и т.д. | — |
| `cleanup()` — перед `patch ended` | 1208 | `CLEANUP_COMPLETE` | ✅ |
| `reset()` | 1224 | journal `clear()` | ✅ idle |

#### 2.3. Паттерн вставки в `patch()` (единственная точка для CALL_STATE)

```ts
private patch(partial: Partial<CallState>): void {
  const prevPhase = this.state.phase;
  // ... существующий код без изменений ...
  if (prevPhase !== this.state.phase) {
    this.journal.record("CALL_STATE", `${prevPhase} → ${this.state.phase}`);
    if (isCallObservabilityEnabled()) {
      const violations = checkCallInvariants(this.buildInvariantContext());
      for (const v of violations) {
        this.journal.record("INVARIANT_VIOLATION", v);
        console.warn("[call-invariant]", v);
      }
    }
    // ... существующие side effects (sounds, polling) — НЕ ТРОГАТЬ
  }
}
```

#### 2.4. Паттерн для существующих guard-return

**Не менять условие**, только добавить перед `return`:

```ts
if (this.state.phase !== "incoming" || !this.state.callId) {
  this.journal.record("IGNORED_EVENT", "ACCEPT", {
    phase: this.state.phase,
    callId: this.state.callId,
  });
  return;
}
```

Аналогично для:

- `startOutgoing()` → `isInCall()`
- `handleDeepLink()` → `isInCall()`
- `handleSignal()` — offer во время `incoming`, answer не в `outgoing|connecting`
- `handlePeerConnected()` — уже `active`

#### 2.5. Публичный API для UI (только чтение)

```ts
// в CallController
exportCallJournal(): string { return this.journal.exportText(); }
```

Или через `getCallController().exportCallJournal()` — без нового React state.

---

### `src/lib/messenger/call/peer-connection.ts`

**Минимально:** не менять lifecycle. Опционально — callback `onTransportEvent?: (type, detail) => void` в `setHandlers`, чтобы journal не дублировал парсинг ICE states.

Если без callback — достаточно логировать ICE в `call-controller.ts` в уже существующих `onIceConnectionState` / `onConnectionState`.

**Не трогать:** `close()`, `remoteSyncTimers`, `ontrack`.

---

### `src/app/tools/messenger/components/call/ActiveCallScreen.tsx`

**Добавить в `DebugPanel`** (по образцу `src/app/tools/guitar-tuner/components/TunerDebugPanel.tsx`):

```
[Отправить лог звонка]  → navigator.clipboard.writeText(getCallController().exportCallJournal())
```

- Кнопка видна при `phase ∈ {outgoing, connecting, active, ended}` + observability enabled.
- Показать последние 5 строк journal inline (опционально).
- **Не добавлять** `useState` для call phase / transport.

---

### `src/app/tools/messenger/components/MessengerCallBootstrap.tsx`

**Только journal** (Этап 1):

```ts
// в tick(), когда controller.handleDeepLink() вызывается
journal.record("INITIATE", "deep_link_bootstrap", { source: "MessengerCallBootstrap" });
```

Цель: увидеть race между Bootstrap и `startIncomingWatch` (сценарий #9 из ТЗ).

**Не объединять** polling на Этапе 1.

---

### `src/lib/messenger/call/call-sounds.ts`, `call-audio-interruption.ts`

**Не трогать** на Этапе 1 (таймеры остаются снаружи CallEngine — это известный gap, journal зафиксирует через `INVARIANT_VIOLATION` только если добавите опциональный `TIMER_REGISTERED` hook позже).

---

## 3. Что ожидаем увидеть в journal (baseline текущего кода)

После Этапа 1 прогон сценариев 1, 6, 8, 13 должен **намеренно** показать:

| # | Сценарий | Ожидаемые записи journal | Ожидаемые INVARIANT_VIOLATION |
|---|---|---|---|
| 1 | Обычный звонок A→B | `INITIATE → CREATE_PC → OFFER_SENT → ANSWER_RECEIVED → ICE_CONNECTED → TRACK_REMOTE → active` | `pc !== null` в `outgoing` (caller) |
| 6 | Повторный звонок после ENDED | `CLEANUP_COMPLETE` → 2.5с → idle → новый `INITIATE` | возможно `ended` с живыми refs до `reset()` |
| 8 | PWA свёрнут в active | `ICE_DISCONNECTED` / `CLEANUP_START` | — |
| 9 | Race двойной инициации | два `INITIATE` / `IGNORED_EVENT` от второго poller | — |
| 13 | ACCEPT в active | `IGNORED_EVENT: ACCEPT (state=active)` | — |

Если journal **не** показывает эти паттерны — хук вставлен не туда.

---

## 4. Definition of Done — Этап 1

- [ ] TypeScript компилируется
- [ ] ESLint без новых warnings
- [ ] **Ноль** изменений в: условиях `patch({ phase })`, порядке `cleanup()`, создании/закрытии PC, polling intervals
- [ ] `grep RTCPeerConnection` в `components/` — по-прежнему 0
- [ ] Journal экспортируется кнопкой из `ActiveCallScreen`
- [ ] Сценарии 1, 6, 8, 13 пройдены вручную, journal сохранён
- [ ] `IGNORED_EVENT` появляется при сценарии 13
- [ ] `INVARIANT_VIOLATION` появляется при сценарии 1 (caller PC в outgoing) — это **норма** для Этапа 1
- [ ] Journal: монотонный `seq`, нет дыр в `CALL_STATE` цепочке

---

## 5. Порядок работ агенту (Agent Contract §11)

### Шаг 1 — Анализ ✅

См. сопоставление текущего кода с ТЗ-аддендумом v3.0 (отдельный анализ).

### Шаг 2 — План реализации (минимальный diff)

| Файл | Действие | Строк ~добавить |
|---|---|---|
| `call-journal.ts` | создать | ~120 |
| `call-invariants.ts` | создать | ~80 |
| `call-observability.ts` | создать | ~20 |
| `call-controller.ts` | хуки | ~60–80 |
| `ActiveCallScreen.tsx` | кнопка экспорта | ~15 |
| `MessengerCallBootstrap.tsx` | 1 запись journal | ~3 |
| `types.ts` | `TransportPhase` type | ~5 |

**Affected transitions:** никакие (только наблюдение)  
**Potential regressions:** минимальные — риск только perf от journal в hot path; mitigated throttle на `POLL_TICK`  
**Regression checklist:** §9 ТЗ пункты 1, 6, 8, 13, 15

### Шаг 3 — Подтверждение

Ждать явного «да, делай Этап 1».

### Шаг 4 — Проверка

Ручной прогон + сравнение экспортированных journal с таблицей §3.

---

## 6. Явные границы (не перепутать с Этапом 2+)

| Вопрос | Этап 1 | Этап 2+ |
|---|---|---|
| PC создаётся в `outgoing` | Логируем violation | Переносим создание в `connecting` |
| Два incoming poller | Логируем source | Объединяем |
| `active` без remote track | Логируем | Ужесточаем `handlePeerConnected` |
| `CallController` → `CallEngine` | Не переименовываем | Этап 2 |
| Transport в `CallState` | Только journal | Этап 4 |

---

## 7. Быстрый smoke-test после внедрения

```text
1. Включить: localStorage.setItem("qhub_call_journal", "1")
2. Позвонить A→B, принять
3. В debug panel → «Отправить лог звонка»
4. Проверить в тексте:
   - #001 INITIATE
   - CREATE_PC с sessionId
   - CALL_STATE: outgoing → connecting → active
   - нет пропусков seq
5. Повторно нажать Accept в active → IGNORED_EVENT
6. Завершить → CLEANUP_START → CLEANUP_COMPLETE → CALL_STATE: * → ended
```

---

## 8. Справка: текущая архитектура vs ТЗ (кратко)

| Концепция ТЗ | Текущая реализация | Этап 1 |
|---|---|---|
| `CallEngine` | `CallController` | Не переименовывать |
| Call State FSM | `CallPhase` | Только логировать переходы |
| Transport State FSM | Строки в `CallDebugInfo` | Только в journal |
| Event Journal | Нет (клиент) | **Создать** |
| Runtime-инварианты | Нет | **Создать** (warn only) |
| Single Writer | Частично нарушен (dual poll) | Только фиксировать в journal |

---

## Связанные файлы кодовой базы

| Файл | Роль |
|---|---|
| `src/lib/messenger/call/call-controller.ts` | Центральный оркестратор |
| `src/lib/messenger/call/peer-connection.ts` | Обёртка RTCPeerConnection |
| `src/lib/messenger/call/types.ts` | `CallPhase`, `CallState` |
| `src/app/tools/messenger/components/call/CallProvider.tsx` | React subscribe |
| `src/app/tools/messenger/components/call/ActiveCallScreen.tsx` | Debug panel + экспорт |
| `src/app/tools/messenger/components/MessengerCallBootstrap.tsx` | Глобальный incoming poll |
| `src/lib/messenger/call-store.ts` | Server-side signal journal (Redis) |
