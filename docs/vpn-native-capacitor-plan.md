# QHub VPN — нативный тумблер в Capacitor (сценарий 3)

План встроенного VPN **внутри приложения QHub** (Android/iOS), без установки WireGuard.  
Текущий этап (сценарий 1): отдельная страница `/tools/vpn` + бесплатное приложение WireGuard.

---

## Зачем отдельный этап

| Слой | Может поднять VPN? |
|------|-------------------|
| Сайт / WebView (Capacitor UI) | **Нет** — нет доступа к сетевому стеку ОС |
| Приложение WireGuard | **Да** — системный туннель |
| Нативный модуль QHub | **Да** — свой `VpnService` / Network Extension |

Цель сценария 3: пользователь открывает QHub → Настройки → **VPN вкл/выкл** — без сторонних приложений.

---

## Архитектура (целевая)

```
┌─────────────────────────────────────────────────────────┐
│  QHub Capacitor (WebView → www.qhub.kz)                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │  /tools/vpn или Settings → Toggle VPN           │    │
│  │  Capacitor plugin: QHubVpn.connect / disconnect │    │
│  └──────────────────────┬──────────────────────────┘    │
└─────────────────────────┼───────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
   Android VpnService              iOS NEPacketTunnelProvider
   (wireguard-go / tunnel)         (WireGuardKit / wireguard-go)
          │                               │
          └───────────────┬───────────────┘
                          ▼
              WireGuard UDP → VPS :51820
                          │
              API: GET /api/vpn/peers/{id}/config
                   (тот же backend, что сейчас)
```

**Backend не меняется:** Redis peers, whitelist, `wg-sync.mjs` — те же. Меняется только клиент: вместо экспорта `.conf` в WireGuard — конфиг передаётся в нативный туннель по API.

---

## Capacitor plugin (контракт)

Новый плагин `QHubVpn` (или `@qhub/vpn`):

```typescript
interface QHubVpnPlugin {
  /** Доступен ли VPN на этом устройстве ( entitlement / разрешения ) */
  isSupported(): Promise<{ supported: boolean; reason?: string }>;

  /** Запросить разрешение VPN у ОС (Android — один диалог) */
  requestPermission(): Promise<{ granted: boolean }>;

  /** Подключить туннель по конфигу WireGuard (строка ini) */
  connect(options: { config: string; label: string }): Promise<void>;

  /** Отключить туннель */
  disconnect(): Promise<void>;

  /** Статус для UI */
  getStatus(): Promise<{
    connected: boolean;
    label?: string;
    address?: string;
  }>;

  /** События: statusChanged */
  addListener(
    event: "statusChanged",
    handler: (s: { connected: boolean }) => void,
  ): Promise<PluginListenerHandle>;
}
```

Web fallback: плагин возвращает `supported: false` → UI показывает текущий сценарий (WireGuard + QR).

---

## Android

### Стек

- **Минимум SDK 24+** (как у текущего Capacitor Android)
- `android.permission.INTERNET`, `BIND_VPN_SERVICE`
- Библиотека: [wireguard-android](https://github.com/WireGuard/wireguard-android) (`tunnel` module) или embedded `wireguard-go`

### Компоненты

| Файл | Назначение |
|------|------------|
| `QHubVpnPlugin.java` | Capacitor bridge |
| `QHubVpnService extends VpnService` | Foreground service, tunnel lifecycle |
| `AndroidManifest.xml` | `<service android:permission="BIND_VPN_SERVICE" …>` |

### UX

1. Пользователь нажимает «VPN вкл» → `VpnService.prepare()` → системный диалог «QHub хочет создать VPN».
2. Плагин получает конфиг с `/api/vpn/peers/.../config` (cookie messenger session).
3. `connect()` поднимает туннель, иконка 🔒 в status bar.

### Оценка сложности

- Плагин + базовый connect/disconnect: **средняя** (1–2 недели нативной работы с опытом WireGuard)
- Foreground notification, reconnect, battery: **+1 неделя**

---

## iOS

### Стек

- **Network Extension** — отдельный target `QHubVpnExtension`
- [WireGuardKit](https://github.com/WireGuard/wireguard-apple) (Swift)
- App Group для обмена конфигом между основным приложением и extension

### Apple-требования

1. **Apple Developer Program** ($99/год) — уже нужен для App Store.
2. Capability **Personal VPN** / **Network Extensions** — включить в Xcode.
3. **Entitlement `com.apple.developer.networking.networkextension`** — иногда нужно обоснование в Apple (личный/семейный VPN обычно ок).
4. Extension **увеличивает размер IPA** и усложняет review.

### UX

1. Settings → VPN → разрешить добавление конфигурации (один раз).
2. Тумблер в QHub вызывает `NETunnelProviderManager`.
3. Конфиг с сервера → сохранение в App Group → extension стартует туннель.

### Оценка сложности

- **Выше Android:** отдельный target, provisioning, отладка extension — **2–4 недели**

---

## Веб-UI (общий для этапов 1 и 3)

На `/tools/vpn` (или позже в messenger settings):

```tsx
const native = await QHubVpn.isSupported();
if (native.supported) {
  // Тумблер: connect / disconnect
} else {
  // Текущий UI: WireGuard + QR + скачать .conf
}
```

Feature flag: `NEXT_PUBLIC_QHUB_NATIVE_VPN=1` после релиза в Store.

---

## Фазы реализации

### Фаза 0 — сейчас ✅

- `/tools/vpn`, whitelist, WireGuard конфиги, `wg-sync`
- Карточка на главной **скрыта** без `vpnEnabled`

### Фаза 1 — Android MVP

- [ ] Capacitor plugin scaffold
- [ ] `QHubVpnService` + WireGuard tunnel
- [ ] UI toggle на `/tools/vpn`
- [ ] Internal testing (APK sideload)

### Фаза 2 — iOS MVP

- [ ] Network Extension target
- [ ] WireGuardKit integration
- [ ] TestFlight

### Фаза 3 — polish

- [ ] Auto-reconnect при смене сети
- [ ] Kill switch (опционально)
- [ ] Статистика трафика в админке
- [ ] On-demand: «VPN только в роуминге» (опционально)

---

## Риски

| Риск | Митигация |
|------|-----------|
| Apple отклонит Network Extension | Чёткое описание «семейный VPN для связи»; fallback WireGuard |
| Два VPN одновременно (WireGuard + QHub) | Документировать: только один активный |
| Battery drain | WireGuard лёгкий; foreground service на Android |
| Обновление конфига при смене IP сервера | Push или pull при открытии приложения |

---

## Связь с текущим кодом

| Уже есть | Переиспользуем |
|----------|----------------|
| `src/lib/vpn/store.ts` | peers, IP allocation |
| `/api/vpn/peers/*/config` | отдаёт ini-конфиг нативному плагину |
| `canViewerSeeVpnApp()` | видимость карточки |
| `scripts/vpn/wg-sync.mjs` | сервер без изменений |

---

## Рекомендация

1. **Сейчас:** сценарий WireGuard (бесплатно, работает за день после bootstrap VPS).
2. **Параллельно:** Фаза 1 Android — если большинство родных на Android.
3. **iOS:** после Android или если критичен iPhone.

Могу начать Фазу 1 (Android plugin scaffold) отдельной веткой по вашему сигналу.
