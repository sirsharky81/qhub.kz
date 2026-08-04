# VPN для России (AmneziaWG)

Стандартный **WireGuard** из портала QHub работает в Китае и многих странах, но в **России** (Мегафон, Билайн, DPI ТСПУ) трафик часто не идёт через туннель: handshake есть, WhatsApp и сайты не открываются, IP остаётся российским.

Для России на том же VPS поднимается **AmneziaWG** — отдельный сервер с обфускацией, приложение **AmneziaVPN** (не WireGuard).

---

## Для пользователя в России

1. Установите **[AmneziaVPN](https://amnezia.org/)** (iOS / Android) — **не** WireGuard.
2. Администратор пришлёт **QR-код** или ссылку `vpn://…`.
3. В AmneziaVPN: **+** → сканировать QR или вставить ссылку.
4. Включите VPN. Проверка: откройте любой зарубежный сайт или WhatsApp.

**Не используйте** конфиг `.conf` из `/tools/vpn` в России — он для обычного WireGuard.

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
| Порт | UDP **3355** |
| Режим | полный туннель (`0.0.0.0/0`) |
| Preset | mobile (обфускация для DPI) |

WireGuard QHub на **UDP 443** для Китая **не трогается**.

---

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

1. Переустановите конфиг через `amnezia-client.sh regen <имя>`.
2. Попробуйте мобильный интернет вместо Wi‑Fi (или наоборот).
3. Убедитесь, что в AmneziaVPN импортирован **AmneziaWG** конфиг, не WireGuard.

---

## Связанные файлы

| Файл | Назначение |
|------|------------|
| `scripts/deploy/amneziawg-bootstrap.sh` | Установка AmneziaWG |
| `scripts/vpn/amnezia-client.sh` | Клиенты и QR |
| `docs/vpn.md` | Обычный WireGuard (Китай и др.) |
