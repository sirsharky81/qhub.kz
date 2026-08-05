# QHub Mail (@qhub.kz)

Self-hosted почта на том же VPS, что и **qhub.kz**.

**Стек:** Postfix (SMTP) + Dovecot (IMAP) + OpenDKIM (подпись) + **Rspamd** (антиспам с первого дня) + **Fail2Ban** + **квоты** на ящик.

---

## Как это работает

```
Клиент (Thunderbird, Apple Mail, …)
        │
        ├── IMAP 993  ──► Dovecot ──► /var/mail/vhosts/qhub.kz/user/
        │
        └── SMTP 587  ──► Postfix ──► Rspamd ──► OpenDKIM ──► интернет

Входящая почта (порт 25):
  Postfix → Rspamd (Spamhaus RBL, SPF/DMARC check, Bayes) → Dovecot LMTP

Исходящая (порт 587, auth):
  Postfix → Rspamd → OpenDKIM (подпись) → интернет

Brute-force:
  Fail2Ban следит за /var/log/mail.log (Postfix SASL + Dovecot auth)
```

**Домен:** `@qhub.kz`  
**Сервер:** `mail.qhub.kz`

---

## Однократная установка на VPS

```bash
ssh -i ~/.ssh/id_ed25519_qhub root@65.108.215.248
cd /var/www/qhub.kz
git pull origin main
bash scripts/deploy/mail-bootstrap.sh
```

Скрипт ставит Postfix, Dovecot, OpenDKIM, **Rspamd**, **Fail2Ban**, квоты Dovecot (по умолчанию **1G**/ящик), открывает порты 25/587/993.

---

## DNS + PTR — обязательно до отправки почты

### 1. DNS-записи (регистратор / Cloudflare)

Bootstrap выведет точные значения. Шаблон:

| Запись | Тип | Значение |
|--------|-----|----------|
| `mail.qhub.kz` | A | `65.108.215.248` |
| `qhub.kz` | MX | `10 mail.qhub.kz.` |
| `qhub.kz` | TXT (SPF) | `v=spf1 mx a:mail.qhub.kz ip4:65.108.215.248 -all` |
| `default._domainkey.qhub.kz` | TXT | из вывода bootstrap (DKIM) |
| `_dmarc.qhub.kz` | TXT | `v=DMARC1; p=quarantine; adkim=s; aspf=s; rua=mailto:postmaster@qhub.kz; pct=100` |

**SPF `-all`** — жёсткий запрет отправки не с нашего сервера.  
**DMARC `p=quarantine`** — письма без DKIM/SPF попадают в спам у получателя.

### 2. PTR / reverse DNS (Hetzner)

**Без PTR Gmail и Yandex часто отклоняют исходящую почту.**

Hetzner Cloud → ваш сервер → **Networking** → Primary IP → **Reverse DNS (rDNS)**:

```
65.108.215.248  →  mail.qhub.kz
```

### 3. Проверка

```bash
bash /var/www/qhub.kz/scripts/mail/mail-dns-check.sh
```

Скрипт проверяет MX, A, SPF, DKIM, DMARC, PTR и выводит OK/WARN/FAIL.

---

## TLS-сертификат

После A-записи `mail.qhub.kz`:

```bash
certbot certonly --standalone -d mail.qhub.kz \
  --pre-hook 'systemctl stop postfix dovecot rspamd' \
  --post-hook 'systemctl start postfix dovecot opendkim rspamd fail2ban'
systemctl restart postfix dovecot opendkim rspamd fail2ban
```

В `.env.production`: `MAIL_ENABLED=1` → `pm2 restart qhub`.

---

## Rspamd (антиспам)

Устанавливается **сразу**, не «на потом».

| Что делает | Как |
|------------|-----|
| RBL (Spamhaus ZEN) | Блокирует IP из чёрных списков на входе |
| SPF / DKIM / DMARC | Проверяет входящие письма |
| Bayes | Обучается на спам/хам (автоматически) |
| Порог reject | Score ≥ 15 → отклонить |
| Порог заголовка | Score ≥ 6 → `X-Spam: Yes` |

Проверка:

```bash
systemctl status rspamd
rspamc stat
tail -f /var/log/mail.log | grep -i rspamd
```

**Важно:** если IP уже в Spamhaus (например, из-за старых арендаторов Hetzner), входящая/исходящая почта может страдать. Проверить: [check.spamhaus.org](https://check.spamhaus.org).

---

## Fail2Ban

Защита от перебора паролей IMAP/SMTP:

| Jail | Что блокирует |
|------|---------------|
| `postfix-sasl` | Brute-force SMTP auth |
| `dovecot` | Brute-force IMAP auth |

```bash
fail2ban-client status
fail2ban-client status dovecot
fail2ban-client status postfix-sasl
```

Бан: 2 часа после 3 неудачных попыток за 10 минут.

---

## Квоты

По умолчанию: **1G на ящик** (`MAIL_DEFAULT_QUOTA=1G`).

```bash
# Изменить квоту
bash /var/www/qhub.kz/scripts/mail/mail-quota.sh user@qhub.kz 2G

# Посмотреть использование (на сервере)
doveadm quota get -u user@qhub.kz
```

Новые ящики получают квоту из `MAIL_DEFAULT_QUOTA` автоматически.

---

## Hetzner: порт 25 и firewall

1. **Разблокировка порта 25** — через support Hetzner (если исходящая почта не уходит).
2. **Cloud Firewall** — TCP 25, 587, 993 (UFW недостаточно, если есть облачный firewall).

---

## Переменные окружения

```env
MAIL_ENABLED=1
MAIL_DOMAIN=qhub.kz
MAIL_HOST=mail.qhub.kz
MAIL_VPS_IP=65.108.215.248
MAIL_DEFAULT_QUOTA=1G
MAIL_ADD_COMMAND=bash /var/www/qhub.kz/scripts/mail/mail-add.sh
MAIL_PASSWD_COMMAND=bash /var/www/qhub.kz/scripts/mail/mail-passwd.sh
MAIL_LIST_COMMAND=bash /var/www/qhub.kz/scripts/mail/mail-list.sh
MAIL_REMOVE_COMMAND=bash /var/www/qhub.kz/scripts/mail/mail-remove.sh
MAIL_QUOTA_COMMAND=bash /var/www/qhub.kz/scripts/mail/mail-quota.sh
MAIL_DNS_CHECK_COMMAND=bash /var/www/qhub.kz/scripts/mail/mail-dns-check.sh
```

---

## Создание ящика

**Админка:** `/qhub-ctrl-7k2m` → Messenger → «Почта @qhub.kz»

**SSH:**
```bash
bash /var/www/qhub.kz/scripts/mail/mail-add.sh user@qhub.kz 'InitialPassword123'
```

---

## Смена пароля

**Пользователь:** https://www.qhub.kz/tools/mail/password

**Админ (сброс):**
```bash
bash /var/www/qhub.kz/scripts/mail/mail-passwd.sh user@qhub.kz 'NewPassword123'
```

---

## Настройки почтового клиента

| Параметр | Значение |
|----------|----------|
| IMAP | `mail.qhub.kz:993` (SSL) |
| SMTP | `mail.qhub.kz:587` (STARTTLS) |
| Логин | `user@qhub.kz` |

**Outlook:** в **Другие настройки → Папки** укажите «Отправленные» = `Sent`. Если письма **застревают в «Исходящих»** и **дублируются у получателя** — Outlook повторно шлёт из «Исходящих», потому что не смог сохранить копию в Sent:

1. **Сначала остановить дубли:** Файл → **Работать автономно** (вкл.) → папка **Исходящие** → удалить всё (**не** «Отправить»).
2. **Папки:** Отправленные = `Sent`, Черновики = `Drafts`, Удалённые = `Trash`.
3. **Расширенные:** корневой путь IMAP — пусто; SSL для IMAP 993.
4. Автономный режим — выкл. → одно тестовое письмо.

Если папки нет:

```bash
bash /var/www/qhub.kz/scripts/mail/mail-init-folders.sh boris@qhub.kz
```

Dovecot помечает Sent/Drafts/Trash как special-use (`15-mailboxes.conf`) — Outlook должен подхватить после переподключения аккаунта.

Скрипт создаёт `Sent`, `Drafts`, `Trash` (вызывается автоматически при `mail-add.sh`).

---

## Проверка перед production

```bash
# Службы
systemctl status postfix dovecot opendkim rspamd fail2ban

# DNS + PTR
bash /var/www/qhub.kz/scripts/mail/mail-dns-check.sh

# Auth
doveadm auth test user@qhub.kz 'password'

# Отправить тест → mail-tester.com, проверить score ≥ 9/10

# Health-check
python3 /var/www/qhub.kz/scripts/deploy/vps-health-check.py
```

---

## Файлы на сервере

| Путь | Назначение |
|------|------------|
| `/var/mail/vhosts/qhub.kz/` | Maildir |
| `/etc/dovecot/users` | Пароли + квоты |
| `/etc/rspamd/local.d/qhub.conf` | Пороги антиспама |
| `/etc/fail2ban/jail.d/qhub-mail.local` | Jail'ы |
| `/etc/opendkim/keys/qhub.kz/` | DKIM-ключи |

---

## Связанные файлы в репозитории

| Файл | Назначение |
|------|------------|
| `scripts/deploy/mail-bootstrap.sh` | Установка всего стека |
| `scripts/mail/config/*` | Rspamd, Fail2Ban, квоты |
| `scripts/mail/mail-dns-check.sh` | Проверка SPF/DKIM/DMARC/PTR |
| `scripts/mail/mail-quota.sh` | Изменить квоту |
| `scripts/mail/mail-add.sh` | Создать ящик |
| `scripts/mail/mail-init-folders.sh` | Sent / Drafts / Trash для ящика |
| `docs/vps.md` | Общая схема VPS |
