# QHub VPN (WireGuard)

Личный VPN для родных и доверенных пользователей через портал **qhub.kz**. Доступ выдаётся по номеру телефона (whitelist мессенджера + флаг VPN).

---

## Как это работает

```
Пользователь (whitelist + VPN вкл.)
        │
        ▼
   /tools/vpn — вход через мессенджер (PIN)
        │
        ▼
   Создаёт устройство → конфиг WireGuard (.conf / QR)
        │
        ▼
   Бесплатное приложение WireGuard → туннель
        │
        ▼
   WireGuard на VPS (UDP 51820) → интернет через сервер
```

**Видимость:** карточка VPN на главной **не показывается** посторонним. Её видят только:
- администратор;
- пользователь с активным whitelist **и** включённым VPN (`vpnEnabled`).

Прямая ссылка `/tools/vpn` без доступа показывает экран «Доступ по приглашению», без карточки на главной.

**Сценарий 3 (встроенный VPN в приложении QHub):** см. `docs/vpn-native-capacitor-plan.md`.

Админ включает VPN для номера в **Админка → Messenger → VPN выкл./вкл.**

Пользователь открывает **https://www.qhub.kz/tools/vpn**, входит тем же номером и PIN, что и в мессенджере.

---

## Однократная установка на VPS

Рекомендуется **отдельный VPS для VPN** или тот же Hetzner-сервер (см. `docs/vps.md`).

```bash
ssh root@YOUR_VPS
cd /var/www/qhub.kz
git pull origin main
bash scripts/deploy/vpn-bootstrap.sh
```

Скрипт:
- ставит WireGuard;
- генерирует ключи сервера;
- включает IP forwarding и NAT;
- дописывает переменные в `.env.production`.

Перезапустите приложение:

```bash
pm2 restart qhub
```

---

## Переменные окружения

```env
VPN_ENABLED=1
VPN_SERVER_PUBLIC_KEY=<из вывода vpn-bootstrap.sh>
VPN_SERVER_ENDPOINT=65.108.215.248:51820
VPN_DNS=1.1.1.1, 8.8.8.8
VPN_SYNC_COMMAND=/var/www/qhub.kz/scripts/vpn/run-wg-sync.sh
```

При создании/отключении устройства портал вызывает `VPN_SYNC_COMMAND` и обновляет peers на сервере. Если новый конфиг **не делает handshake**, а старый работает — peer не попал на WireGuard: нажмите **«Синхронизировать WireGuard»** в админке или выполните команду ниже.

Ручная синхронизация:

```bash
cd /var/www/qhub.kz
node --env-file=.env.production scripts/vpn/wg-sync.mjs
```

---

## Выдача доступа пользователю

1. Админка → **Messenger** → добавить номер в whitelist (если ещё нет).
2. Нажать **VPN выкл.** → станет **VPN вкл.**
3. Отправить ссылку **https://www.qhub.kz/tools/vpn**
4. Пользователь входит (номер + PIN), создаёт устройство, скачивает `.conf` или сканирует QR в приложении WireGuard.

---

## Redis

| Ключ | Содержимое |
|------|------------|
| `qhub:messenger:whitelist` | `{ phone: { ..., vpnEnabled?: boolean } }` |
| `qhub:vpn:peers` | `{ peerId: VpnPeer }` — ключи и IP клиентов |

---

## Если VPN подключается и сразу отключается (значок пропадает)

1. **WireGuard → ваш туннель → статистика**
   - «Последнее рукопожатие» **меньше 2 минут** и растёт трафик → VPN **работает**
   - Handshake давно, трафик не растёт → VPN **не активен**

2. **Hetzner Cloud Firewall** (частая причина): в панели Hetzner → Firewalls → разрешить **UDP 51820** на сервер `65.108.215.248`. UFW на VPS недостаточно, если есть облачный firewall.

3. **Синхронизация peer на сервере** (SSH):
   ```bash
   ssh -i ~/.ssh/id_ed25519_qhub root@65.108.215.248
   cd /var/www/qhub.kz
   node --env-file=.env.production scripts/vpn/wg-sync.mjs
   wg show
   ```
   В выводе `wg show` должен быть peer с ключом клиента.

4. **Пересоздайте конфиг** в админке («Конфиг VPN») если меняли ключи на сервере.

5. **Мобильный оператор** может резать UDP — попробуйте Wi‑Fi или другую сеть.

- VPN только для номеров с `vpnEnabled: true` и активным whitelist.
- Отзыв whitelist или VPN автоматически отключает все устройства номера.
- Не публикуйте server private key — он только на VPS в `/etc/wireguard/`.
- Использование VPN должно соответствовать законам вашей страны.

---

## Связанные файлы

| Файл | Назначение |
|------|------------|
| `src/lib/vpn/` | Хранение peers, генерация конфигов |
| `src/app/tools/vpn/` | UI для пользователей |
| `src/app/api/vpn/` | API конфигов |
| `scripts/vpn/wg-sync.mjs` | Синхронизация Redis → WireGuard |
| `scripts/deploy/vpn-bootstrap.sh` | Первичная установка WireGuard |
