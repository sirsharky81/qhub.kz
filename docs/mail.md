# Корпоративная почта `@qhub.kz` на VPS (вариант A)

Self-hosted почта на том же Hetzner VPS, что и сайт QHub. Цель — рабочие адреса вида `boris@qhub.kz` для внешних сервисов (Hilton Honors и др.), где не принимают `@proton.me` / `@gmail.com`.

**Статус:** скрипт и runbook готовы; DNS и запуск на сервере — вручную после согласования шагов.

---

## Схема

```
Ps.kz DNS                         Hetzner VPS (65.108.215.248)
──────────                        ──────────────────────────────
A   mail.qhub.kz  ──────────────► docker-mailserver (/opt/mailserver)
MX  qhub.kz       ──────────────► mail.qhub.kz
TXT SPF / DKIM / DMARC

A   www.qhub.kz   ──────────────► nginx → PM2 (без изменений)
```

Почта живёт **отдельно** от `/var/www/qhub.kz` — сайт и мессенджер не трогаем.

---

## Что понадобится

| Параметр | Значение |
|----------|----------|
| VPS IP | `65.108.215.248` |
| Почтовый хост | `mail.qhub.kz` |
| Домен | `qhub.kz` |
| Панель DNS | Ps.kz → Домены → qhub.kz → Управление DNS |
| PTR (rDNS) | Hetzner Cloud → Server → Networking → Reverse DNS → `mail.qhub.kz` |

---

## Шаг 0 — Проверки перед стартом

### 0.1 Порт 25 у Hetzner

Hetzner иногда блокирует исходящий SMTP (порт 25) на новых аккаунтах.

На VPS:

```bash
nc -vz smtp.gmail.com 25
```

Если `Connection timed out` — откройте тикет в Hetzner Support: «Please unblock outbound port 25 for mail server on this server» (укажите IP и домен `qhub.kz`).

Без порта 25 письма **не уйдут** наружу (входящие через MX могут работать).

### 0.2 Свободная память

CX23 — 4 GB RAM. Mailserver ~500 MB–1 GB. Перед установкой:

```bash
free -h
pm2 status
```

---

## Шаг 1 — DNS на Ps.kz

Добавьте **до** или **сразу после** установки (полная работа — после DKIM, ~4–24 ч).

### Обязательные записи

| Тип | Имя | Значение |
|-----|-----|----------|
| **A** | `mail` | `65.108.215.248` |
| **MX** | `@` (пусто) | `mail.qhub.kz`, приоритет **10** |
| **TXT** | `@` | `v=spf1 ip4:65.108.215.248 -all` |

### После генерации DKIM на сервере

| Тип | Имя | Значение |
|-----|-----|----------|
| **TXT** | `mail._domainkey` | *(строка из `setup config dkim`)* |

### Рекомендуется (DMARC)

| Тип | Имя | Значение |
|-----|-----|----------|
| **TXT** | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:boris@qhub.kz` |

**Не меняйте** A-записи `www` / `@` для сайта.

Проверка:

```bash
dig MX qhub.kz +short
dig A mail.qhub.kz +short
dig TXT qhub.kz +short
```

---

## Шаг 2 — Reverse DNS (Hetzner)

1. Hetzner Cloud Console → ваш сервер → **Networking** → **Primary IP**
2. **Reverse DNS** → `mail.qhub.kz`
3. Сохранить

Проверка:

```bash
dig -x 65.108.215.248 +short
# ожидается: mail.qhub.kz.
```

---

## Шаг 3 — Установка на VPS

SSH:

```bash
ssh -i ~/.ssh/id_ed25519_qhub root@65.108.215.248
```

### Автоматически (рекомендуется)

```bash
cd /var/www/qhub.kz
git pull origin main
bash scripts/deploy/mail-bootstrap.sh
```

Создать первый ящик (пароль — свой или сгенерированный):

```bash
MAILBOX=boris@qhub.kz MAIL_PASSWORD='НадёжныйПароль!' bash scripts/deploy/mail-bootstrap.sh
```

### Вручную (если нужен контроль)

См. `scripts/deploy/mail-bootstrap.sh` — те же шаги: Docker, `/opt/mailserver`, docker-mailserver, UFW, DKIM.

---

## Шаг 4 — Ящики

```bash
# Добавить ящик
docker exec -it mailserver setup email add boris@qhub.kz

# Список
docker exec -it mailserver setup email list

# Опционально — support для VAPID (.env.example)
docker exec -it mailserver setup email add support@qhub.kz
```

---

## Шаг 5 — Клиенты

| Параметр | Значение |
|----------|----------|
| IMAP | `mail.qhub.kz`, порт **993**, SSL/TLS |
| SMTP | `mail.qhub.kz`, порт **587**, STARTTLS |
| Логин | полный адрес, напр. `boris@qhub.kz` |

Веб-почта: можно поднять через nginx + roundcube позже; на первом этапе достаточно Thunderbird / Apple Mail / Outlook.

---

## Шаг 6 — Проверка доставки

```bash
# На VPS — health-check (включая почту)
python3 /var/www/qhub.kz/scripts/deploy/vps-health-check.py

# Отправка теста (если установлен mailutils)
echo "QHub mail test" | mail -s "test from qhub" ваш@gmail.com -a "From: boris@qhub.kz"
```

Снаружи:

1. Отправьте письмо **на** `boris@qhub.kz` с Gmail — должно прийти.
2. Ответьте **с** `boris@qhub.kz` — должно дойти.
3. [mail-tester.com](https://www.mail-tester.com) — цель **8+/10**.

---

## Шаг 7 — Hilton Honors

| Поле | Значение |
|------|----------|
| Рабочий email | `boris@qhub.kz` |
| Домен email | `qhub.kz` |

Если форма на шаге 2 уже не даёт изменить email — support Hilton с просьбой заменить адрес.

---

## Эксплуатация

```bash
# Статус контейнера
docker ps --filter name=mailserver

# Логи
docker logs mailserver --tail 100

# Перезапуск
cd /opt/mailserver && docker compose restart

# Обновление образа (осторожно, по schedule)
cd /opt/mailserver && docker compose pull && docker compose up -d
```

Каталог данных: `/opt/mailserver/docker-data/dms/` (бэкапить при необходимости).

---

## Откат

1. Ps.kz — удалить MX и A `mail`, TXT SPF/DKIM/DMARC.
2. VPS — `cd /opt/mailserver && docker compose down`.
3. UFW — убрать правила 25/587/993 при желании.
4. Hetzner — сбросить PTR.

Сайт QHub **не затрагивается**.

---

## Связанные файлы

| Файл | Назначение |
|------|------------|
| `scripts/deploy/mail-bootstrap.sh` | Установка docker-mailserver |
| `scripts/deploy/vps-health-check.py` | Проверка MX, портов, контейнера |
| `docs/vps.md` | Общая схема production VPS |

---

## Чеклист

- [ ] Hetzner: порт 25 открыт
- [ ] Hetzner: PTR → `mail.qhub.kz`
- [ ] Ps.kz: A `mail`, MX, SPF
- [ ] VPS: `mail-bootstrap.sh` выполнен
- [ ] Ps.kz: DKIM TXT добавлен
- [ ] Ps.kz: DMARC (опционально)
- [ ] Тест send/receive OK
- [ ] mail-tester ≥ 8/10
- [ ] Hilton: `boris@qhub.kz`
