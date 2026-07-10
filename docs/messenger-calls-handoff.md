# Handoff: аудио/видео звонки мессенджера — баги, анализ, исправления

Дата: 10–11 июля 2026. Документ фиксирует всю аналитику по проблемам звука и
соединения в звонках (iOS PWA/Safari, Android Capacitor), причины, принятые
решения и правила «что нельзя трогать». Последний рабочий деплой: `cce6643`;
ниже — дополнения по улучшениям звонков и UI (июль 2026, не задеплоено).

---

## 1. Архитектура звонка (кто за что отвечает)

| Файл | Роль |
|---|---|
| `src/lib/messenger/call/call-controller.ts` | Оркестратор: фазы звонка, захват медиа, сигналинг, таймеры, cleanup |
| `src/lib/messenger/call/peer-connection.ts` | Обёртка RTCPeerConnection: offer/answer, ICE, привязка удалённого аудио |
| `src/lib/messenger/call/call-media-playback.ts` | iOS-роутинг вывода: `<audio>` (earpiece) / `<video>` (loudspeaker), unlock элементов в жесте |
| `src/lib/messenger/call/call-sounds.ts` | Гудки (caller) и рингтон (callee) |
| `src/lib/messenger/call/signaling-client.ts` | HTTP-клиент сигналинга + кэш/префетч ICE-конфига |
| `src/lib/messenger/call-store.ts` | Redis: сессия звонка, сигналы (atomic seq через INCR), отдельные ключи offer/answer/accepted |
| `src/lib/messenger/realtime/*` + `scripts/realtime/ws-server.mjs` | WebSocket-доставка сигналов (pub/sub через Redis). WS — **дополнение** к поллингу, не замена |
| `src/lib/audio-session.ts` | WebKit `navigator.audioSession` (play-and-record и т.д.) |
| `src/lib/platform/call-audio.ts` | Нативный роутинг динамика/proximity — **только Android Capacitor** |
| `src/lib/platform/call-audio-ios-web.ts` | Поиск deviceId ресивера/динамика на iOS; `iosSinkIdCallRoutingEnabled()` **захардкожен в false** |

Поток сигналов: POST `/api/messenger/call/signal` → Redis (append + publish) →
доставка получателю двумя путями одновременно: WS-пуш (мгновенно) и поллинг
`/api/messenger/call/poll` (150 мс в фазе установки, 250 мс дальше). Offer/answer
дополнительно самовосстанавливаются level-triggered через снапшот сессии
(`syncSdpFromSession` + `resendLocalSdpIfNeeded` каждые 1.5 с).

Тайминги: `constants.ts` — CONNECT_POLL 150 мс, POLL 250 мс, DISCOVERY 400 мс,
ring timeout 45 с, ICE timeout 45 с, max setup 90 с, TTL звонка 120 с.

---

## 2. Хронология проблем и исправлений

### 2.1 Медленное соединение, рассинхрон, потери сигналов (коммиты `9f8a41a`, `1ecfb68`, `c3589fb`)

Симптомы: долгий коннект, «звоним» у caller при уже идущем разговоре у callee,
пропадающий звук, наложения звонков.

Причины и фиксы:
- **Неатомарный `seq` сигналов**: оба пира писали сигналы конкурентно, два
  сигнала получали один seq, курсор `since=seq` навсегда терял один из них
  (ICE или answer). Фикс: `redisIncr` для seq + отдельные Redis-ключи
  `offer/answer/accepted` (session JSON перезаписывался read-modify-write и
  терял поля).
- **ICE-конфиг на критическом пути**: до 8 с на плохой сети перед offer/answer.
  Фикс: кэш 2 мин + префетч в жесте (`prefetchIceServers`).
- **Сигнал `accept`**: callee шлёт его сразу при нажатии «Принять», до
  getUserMedia/createAnswer — caller выходит из «Звоним…» за ~150 мс.
- **Race в `captureUserMedia`**: обработчик «поздних» getUserMedia убивал и
  успешные захваты (мигающий микрофон/камера, полная регрессия). Фикс в
  `c3589fb`: стоппер регистрируется только на пути ошибки; `mediaEpoch`
  инвалидирует in-flight захваты при cleanup.
- **Зависший поллинг сообщений**: `platformFetch` без таймаута висел вечно
  (iOS PWA молча замораживает fetch). Фикс: `AbortSignal.timeout(20s)` на poll
  сообщений; в сигналинге все запросы через `fetchWithTimeout` (8 с / 2.2 с).

Состояние после `c3589fb` подтверждено пользователем: «всё отлично и быстро
соединяет, звук и микрофон работают отлично».

### 2.2 Сага earpiece на iOS (коммиты `258164c` … `4b040c3`) — НЕ РЕШАЕМО с веба

Проблема: в аудиозвонке на iPhone (PWA и Safari) звук идёт из внешнего
динамика, а не из ресивера (трубки).

Что пробовали (всё провалилось в полевых тестах, iOS 18.7 / 26):
1. **WebAudio-relay** (`258164c`) — не помогло.
2. **`setSinkId` на ресивер** (`0c5380e`+`7b90ed9`+`35d62dc`+`4b96866`+`52cf4a9`+
   `ee455ef`+`8951c97`) — выяснено полевой диагностикой (session debug-1c0a94):
   - WebKit требует user gesture / transient activation для `setSinkId`;
   - лейблы устройств локализованы («Приемник», «Динамик»); ресивер появляется
     в `enumerateDevices` только при активном захвате микрофона, а на части
     устройств **не появляется вообще**;
   - даже когда `setSinkId` резолвился успешно, звук фактически оставался на
     громком динамике (разрыв между API и реальным роутингом WebKit);
   - пересоздание плеера после setSinkId замедлило установку звонка и
     роняло звук целиком.
3. **Полный откат** (`4b040c3`): earpiece-путь = прямой стрим на `<audio>`
   элемент; роутинг определяется только типом аудиосессии play-and-record.
   `iosSinkIdCallRoutingEnabled()` = false.

Побочные находки, закреплённые в коде (НЕ МЕНЯТЬ без перепроверки):
- `audioSession.mode = "voice-chat"` **сам переключал звук на громкий динамик**
  (session 480e62/H48) — режим не ставим.
- Хоп `playback → auto → play-and-record` в восстановлении после interruption
  тоже уводил на динамик (H53) — оставлен только `auto → play-and-record`.
- На iOS громкая связь работает только через `<video>` элемент с live video
  track, earpiece — через `<audio>`; одновременно оба элемента в DOM держать
  нельзя (форсится динамик).

### 2.3 Синхронизация фаз и потеря ICE (коммит `0e4b908`, текущая сессия)

Симптомы: caller «несинхронно соединяется» (callee уже в разговоре, caller ещё
в «Соединение…»), на Android изредка срываются звонки.

Причины:
- **Преждевременный переход в active**: `onRemoteTrack → handlePeerConnected(true)`.
  `ontrack` срабатывает при применении SDP — задолго до реальной связи. Callee
  уходил в «разговор» сразу после применения offer (до отправки answer!), caller
  догонял на секунды позже. Фикс: фаза `active` только по реальному состоянию
  транспорта (`isTransportConnected()`: ICE connected/completed или DTLS
  connected). Обе стороны переключаются синхронно (~100 мс разницы).
- **Прыжок курсора сигналов через WS**: `applyPollData` двигал `sinceSeq` по
  max seq из любого источника, включая одиночные WS-пуши. Если WS-подписка
  активировалась посреди пачки (seq 3–4 опубликованы до подписки, 5 — после),
  клиент получал 5 по WS, прыгал курсором и **навсегда терял 3–4 из поллинга**.
  Для offer/answer есть level-triggered повтор, для ICE-кандидатов — нет →
  соединение только через TURN (медленно) или срыв. Фикс: курсор двигается
  **только по ответам поллинга** (полный список без пропусков); WS — чистый
  канал быстрой доставки; обработка сигналов идемпотентна (offer/answer
  защищены `hasRemoteDescription`, дубли ICE безопасны, end/reject — фазой).
- Батч исходящих ICE: 120 мс → 40 мс.

### 2.4 Регрессия «нет звука нигде» после `0e4b908` и фикс (`cce6643`)

Симптом: после 2.3 звук пропал полностью (аудио и видео, iPhone↔iPhone и
iPhone↔Android), соединение 2–3 с, но синхронное.

Причина: «пинок» аудиотракта (активация `play-and-record`,
`activateCallMediaSession`, `playRemoteAudio` + каскад ретраев
[120/320/700/1400 мс]) жил внутри `handlePeerConnected` и вместе с фазой
отложился до ICE connected (2–3 с). В рабочих сборках он срабатывал сразу при
приходе удалённого трека. За паузу аудиосессия iOS «слетала» — глохли и
воспроизведение, и микрофон iPhone (поэтому тишина была у обеих сторон во всех
парах: Android сам по себе был исправен, но слушал замолчавший iPhone).

Фикс (`cce6643`): активация аудиотракта вынесена в `activateCallAudioPath()` и
вызывается в моменты рабочих сборок — при `onRemoteTrack`, при применении
answer и ещё раз при ICE connected. **По транспорту переключается только фаза
UI.** Правило на будущее: аудиотракт и фазовая машина — независимые оси, не
связывать их снова.

### 2.5 Гудки и имитация приближения (`cce6643`)

- Гудки у caller теперь продолжаются и в фазе `connecting` (раньше обрывались
  при нажатии «Принять» у собеседника → 2–3 с мёртвой тишины до разговора).
  Реализация: `updateSoundsForPhase` — `outgoing || (connecting && isCaller)`;
  убраны точечные `getCallSounds().stop()` из `applyRemoteAnswer`,
  `syncProgressFromSession`, `handleSignal("accept")`. Остановка — в
  `handlePeerConnected` (перед flip в active) и в `cleanup`.
- Каденция гудков приведена к телефонной: тон ~1 с каждые 4 с (было 0.45 с
  каждые 6 с). Рингтон callee: 1 с каждые 4 с.
- Удалена искусственная имитация датчика приближения на iPhone
  (авто-затемнение через 1.8 с, чёрный оверлей, кнопка «Погасить экран») из
  `ActiveCallScreen.tsx`. Нативный proximity на Android (`setCallProximityEnabled`)
  оставлен.

---

## 3. Инварианты — что НЕЛЬЗЯ ломать

1. **getUserMedia — первый await после жеста** на iOS. `beginLocalMediaCapture`
   вызывается синхронно из обработчиков кнопок (CallProvider), захват идёт
   параллельно с `initiateCall`/`refreshCallFromServer`.
2. **Треки должны быть в PC до `createOffer`/`createAnswer`** — иначе
   transceivers станут recvonly и звука не будет.
3. Фаза `active` — только по `isTransportConnected()`. Аудиотракт
   (`activateCallAudioPath`) — по приходу трека/answer, независимо от фазы.
4. Курсор `sinceSeq` двигают только poll-ответы (см. 2.3).
5. `iosSinkIdCallRoutingEnabled()` = false; не ставить `voice-chat` mode; не
   делать playback-хоп при восстановлении сессии (см. 2.2).
6. Поллинг при живом WS не отключать и не замедлять — WS additive; замедление
   до 10 с давало до ~19 с рассинхрона при потерянном WS-answer.
7. `resendLocalSdpIfNeeded` нельзя await-ить в поллинге (держит `pollInFlight`
   до 24 с и морозит весь цикл) — только fire-and-forget со своим guard.
8. Ретраи `sendSignalReliable`, re-entrancy guard'ы (`pollInFlight`,
   `sdpSyncInFlight`, `applyPollDataInFlight`) имеют таймауты самовосстановления
   — не убирать.
9. В `captureUserMedia` стоппер поздних стримов регистрируется **только на пути
   ошибки** (регистрация заранее убивает успешные захваты — уже наступали).
10. Прямой стрим на `<audio>` для earpiece: WebAudio-relay поверх удалённого
    WebRTC-стрима даёт тишину на iOS, если raw-стрим не потребляется media-элементом.
11. **Screen share**: отдельный PC/сигналинг (`screen-*`), не трогать основной
    offer/answer/ICE; camera `enabled=false` без renegotiation; mic основного PC
    не останавливать; cleanup при hangup через `screenShare.close()`.

---

## 4. Инструменты отладки

- **Debug-панель звонка**: `NEXT_PUBLIC_MESSENGER_CALL_DEBUG_OVERLAY=1` —
  ICE path/proto, состояние SDP, счётчик опросов, статусы отправки, route,
  audioSession state; кнопка «Отправить лог звонка» копирует журнал
  (`CallJournal`) в буфер.
- **Журнал звонка**: `getCallController().exportCallJournal()` — события
  INITIATE/OFFER_SENT/ANSWER_RECEIVED/ICE_*/TRACK_REMOTE/CLEANUP с таймингами.
- `AGENT_DEBUG=1` в `.env.production` включает `AGENT_DEBUG_ENABLED` (см.
  `src/lib/agent-debug-enabled.ts`).
- VPS: `scripts/deploy/vps-health-check.py`, `docs/vps.md`. Деплой:
  `ssh root@65.108.215.248 "cd /var/www/qhub.kz && git pull && npm install
  --no-audit --no-fund && npm run build && pm2 restart qhub qhub-ws --update-env"`.

---

## 5. Улучшения звонков и UI (июль 2026)

### 5.1 Переключение камеры и меню видеозвонка

- `call-controller.ts`: `switchCamera()` меняет только video-track через
  `captureUserMedia` (audio не трогается) + `attachLocalStream` / `replaceTrack`;
  при ошибке — best-effort откат на предыдущую камеру.
- `ActiveCallScreen.tsx`: кнопка `⋯` рядом с громкой связью (только video-call);
  bottom-sheet: «Перевернуть камеру» и Android-only «Поделиться экраном».
- Инвариант: микрофон, `activateCallAudioPath`, iOS playback и основной SDP
  **не затрагиваются** при flip.

### 5.2 Демонстрация экрана (только Android Capacitor, новый APK)

Архитектура: **отдельный video-only PeerConnection** на нативной стороне,
основной звонок (микрофон + камера) не трогается.

| Слой | Файлы |
|---|---|
| Нативный плагин | `ScreenSharePlugin.java`, `ScreenShareService.java` (foreground `mediaProjection`) |
| Регистрация | `MainActivity.java` → `registerPlugin(ScreenSharePlugin.class)` |
| Manifest | `FOREGROUND_SERVICE_MEDIA_PROJECTION`, service declaration |
| WebRTC dep | `android/app/build.gradle` → `stream-webrtc-android:1.3.10` |
| JS-мост | `call-screen-share.ts` — Capacitor plugin `ScreenShare`, события `signal` |
| Сигналинг | типы `screen-offer/answer/ice/stop` в `types.ts`, `signal/route.ts`, `call-store.ts` |
| Контроллер | `toggleScreenShare()` — camera track `enabled=false` без renegotiation; mic жив |

Поведение:
- Пункт меню скрыт вне Android Capacitor (`canUseNativeScreenShare()`).
- При старте screen share камера отключается (track не stop), микрофон основного
  PC продолжает работать.
- Принимающая сторона (web/PWA/iOS) создаёт receive-only browser PC, показывает
  screen stream основным видео (`remoteScreenStream`).
- При system Stop / ошибке / hangup: `screenShare.close()`, `screen-stop`, возврат камеры.
- **Требует сборки и установки нового APK**; обычный web-деплой не активирует функцию.

### 5.3 Ускорение iPhone↔iPhone видеозвонков

- **CallJournal** — новые контрольные точки: `MEDIA_START/READY`,
  `ICE_CONFIG_START/READY`, `CREATE_PC`, `PC_READY`, `OFFER_CREATED`,
  `ANSWER_CREATED`, `ICE_LOCAL_FIRST`, `ICE_REMOTE_FIRST`, `TRANSPORT_CONNECTED`.
  Кнопка «Отправить лог звонка» копирует полный таймлайн.
- **Префетч ICE** в `CallProvider` при входе в чат (`prefetchIceServers()`), не
  только по жесту call/accept. `getUserMedia` по-прежнему только из жеста.
- **ice-config.ts**: negative cache 30 с при недоступном Metered API (таймаут
  fetch 1.5 с вместо 4+ с); статический TURN (`MESSENGER_TURN_*`) без ожидания Metered.
- **Не применялся** рискованный ранний answer без треков / pre-created transceivers —
  только после полевых метрик.

### 5.4 Кликабельные ссылки в сообщениях

- `src/lib/messenger/linkify.ts` — безопасный парсер text/link, только `http/https`.
- `LinkifiedText.tsx` в `MessageBubble.tsx` (stopPropagation для swipe-to-reply).
- `open-url.ts` — web/PWA: новая вкладка; Android Capacitor: `@capacitor/browser`.
- Переиспользование в `history-media.ts` и вкладке «Ссылки» в `ChatInfoView.tsx`.
- Тесты: `linkify.test.ts` (punctuation, unsafe protocols, unicode, line breaks).

### 5.5 Карточка контакта

- `MessengerChatInfoClient.tsx` + `ChatInfoView.tsx`: крупное фото с preview,
  `peerDisplayLabel` (displayName || maskPhone), online/offline, быстрые
  аудио-/видеозвонки, Медиа/Документы/Ссылки.
- Единый `peerDisplayLabel` в contacts, home, room participants.
- Только разрешённые сервером данные; без auth/PIN, `allowRoomAutoAdd`, точного
  `lastSeen`, профилей вне whitelist.

### 5.6 Стабильный ввод номера в админке (iPhone)

- Убран `scrollIntoView` на focus в `MessengerWhitelistSection.tsx`.
- `interactiveWidget: "resizes-visual"` локально в `qhub-ctrl-7k2m/layout.tsx`.

---

## 6. Открытые вопросы / возможные следующие шаги

- **Earpiece на iOS PWA** остаётся нерешённым (ограничение WebKit). Реальный
  путь — нативная iOS-оболочка (Capacitor) с `AVAudioSession`, как на Android.
- Ускорение ответа callee: createAnswer до завершения getUserMedia через
  заранее добавленные sendrecv-transceivers + `replaceTrack` (−0.5…1.5 с), но
  это рискованный рефакторинг — делать только с полевой проверкой звука на iPhone.
- ICE-restart при `failed` вместо завершения звонка (требует поддержки
  renegotiation: сейчас повторный offer игнорируется guard'ом
  `hasRemoteDescription`).
- Проверить долю соединений через TURN relay в одной Wi-Fi сети (возможна
  изоляция клиентов AP): debug-панель показывает `ICE path`.
- **Screen share**: полевая матрица Android↔iPhone (start/stop/system revoke/hangup)
  после публикации нового APK.

## 7. Проверка (июль 2026)

| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | OK |
| `vitest run linkify.test.ts` | 4/4 OK |
| `npx cap sync android` | OK |
| `./gradlew assembleDebug` | Не запускался (JAVA_HOME не настроен на dev-машине) |
| Реальные устройства (iPhone↔iPhone video timing, Android screen share, admin keyboard) | **Требует полевой матрицы перед деплоем/APK** |

Матрица перед деплоем:
- iPhone↔iPhone video: тайминг по CallJournal, звук не регрессирует
- Android↔iPhone: flip front/back в обе стороны
- Android screen share: start/stop/system revoke/hangup
- Ссылки: web/PWA/APK
- Карточка контакта и iPhone admin keyboard

---

## 8. Ключевые коммиты

| Коммит | Что |
|---|---|
| `9f8a41a`, `1ecfb68` | Races сигналинга, atomic seq, кэш ICE, сигнал accept, таймауты fetch |
| `c3589fb` | Фикс race getUserMedia (рабочая точка: быстрый коннект + звук) |
| `258164c`…`8951c97` | Попытки earpiece (WebAudio relay, setSinkId) — все провалились |
| `4b040c3` | Полный откат earpiece-логики |
| `0e4b908` | Синхронный active по ICE; курсор сигналов только по poll; батч ICE 40 мс |
| `cce6643` | Восстановлен пинок аудиотракта при приходе трека (фикс «нет звука»); гудки до соединения; удалена имитация приближения |
