# VPN для России (AmneziaWG)

Стандартный **WireGuard** из портала QHub работает в Китае и многих странах, но в **России** (Мегафон, Билайн, DPI ТСПУ) трафик часто не идёт через туннель: handshake есть, WhatsApp и сайты не открываются, IP остаётся российским.

Для России на том же VPS поднимается **AmneziaWG** — отдельный сервер с обфускацией, приложение **AmneziaVPN** (не WireGuard).

---

## Для пользователя в России

1. Откройте **https://www.qhub.kz/tools/vpn** (или получите конфиг от администратора).
2. Выберите **AmneziaVPN** при создании устройства.
3. Установите **[AmneziaVPN](https://amnezia.org/)** (iOS / Android).
4. Скачайте `.conf`, отсканируйте **QR** или скопируйте ссылку **`vpn://`** на странице.
5. Включите VPN. Проверьте WhatsApp и сайты.

QR и конфиги генерируются **в портале** — SSH больше не обязателен.

---

## Установка на VPS (один раз)

```bash
ssh root@65.108.215.248
cd /var/www/qhub.kz
git pull origin main
sudo bash scripts/deploy/amneziawg-bootstrap.sh
```

Установщик может попросить **перезагрузку** — после reboot снова:

```bash
sudo bash scripts/deploy/amneziawg-bootstrap.sh
```

Параметры по умолчанию:

| Параметр | Значение |
|----------|----------|
| Интерфейс | `awg0` (рядом с `wg0` QHub) |
| Порт | UDP **443** (мобильные операторы РФ блокируют нестандартные порты вроде 3355) |
| Режим | полный туннель (`0.0.0.0/0`) |
| Preset | mobile (обфускация для DPI) |

WireGuard QHub — **UDP 51820** (Китай и др.), когда AmneziaWG занимает **UDP 443** для России.

---

## После смены порта на сервере

Старый конфиг с `:3355` в Endpoint **не подключится из РФ**. В портале заново скачайте QR / `vpn://` или создайте новое устройство и импортируйте в AmneziaVPN.

## Выдача конфига родным

```bash
sudo bash /var/www/qhub.kz/scripts/vpn/amnezia-client.sh add sofia mama
```

Файлы: `/root/awg/clients/<имя>/` — QR `.vpnuri.png` и `.conf`.

Отправьте QR в Telegram/WhatsApp (когда VPN выключен) или файл `.conf`.

---

## GitHub Actions

Workflow **AmneziaWG setup (Russia)** → `workflow_dispatch`:

- пустой `clients` — только установка/проверка;
- `clients: sofia,mama` — создать клиентов и скачать QR как artifact.

---

## Если не подключается

1. Переустановите конфиг через `amnezia-client.sh regen <имя>` или `regen-all`.
2. Попробуйте мобильный интернет вместо Wi‑Fi (или наоборот).
3. Убедитесь, что в AmneziaVPN импортирован **AmneziaWG** конфиг, не WireGuard.

## «Подключено», но WhatsApp и сайты не работают

Типично для российского DPI на 4G: handshake проходит, трафик режется.

1. На сервере: `sudo bash scripts/vpn/repair-amnezia-russia.sh` (обновляет installer, mobile preset, regen).
2. В приложении **удалите** старый профиль и заново импортируйте QR/`vpn://` из портала.
3. Проверьте IP на [2ip.ru](https://2ip.ru) — должен быть IP VPS (`65.108.215.248`).

**QHub без VPN в РФ:** домен/IP VPS может быть в реестре блокировок — для доступа к qhub.kz из России нужен рабочий VPN-туннель.

---

## Связанные файлы

| Файл | Назначение |
|------|------------|
| `scripts/deploy/amneziawg-bootstrap.sh` | Установка AmneziaWG |
| `scripts/vpn/amnezia-client.sh` | Клиенты и QR |
| `docs/vpn.md` | Обычный WireGuard (Китай и др.) |
