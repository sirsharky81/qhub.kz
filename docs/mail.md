# QHub Mail (@qhub.kz)

Self-hosted почта на том же VPS, что и **qhub.kz**: Postfix (SMTP), Dovecot (IMAP), OpenDKIM (подпись исходящих писем).

---

## Как это работает

```
Пользователь (Gmail app, Apple Mail, Thunderbird, …)
        │
        ├── IMAP 993  ──► Dovecot ──► /var/mail/vhosts/qhub.kz/user/
        │
        └── SMTP 587  ──► Postfix ──► интернет (+ OpenDKIM)

Админ создаёт ящик:
  Админка → Messenger → «Почта @qhub.kz»
  или SSH: scripts/mail/mail-add.sh

Пользователь меняет пароль:
  https://www.qhub.kz/tools/mail/password
  или SSH: scripts/mail/mail-passwd.sh --verify …
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

Скрипт:
- ставит Postfix, Dovecot, OpenDKIM;
- создаёт виртуальные ящики в `/var/mail/vhosts/qhub.kz/`;
- открывает порты 25, 587, 993 в UFW;
- дописывает переменные в `.env.production`.

После установки нужен TLS-сертификат для `mail.qhub.kz`:

```bash
certbot certonly --standalone -d mail.qhub.kz \
  --pre-hook 'systemctl stop postfix dovecot' \
  --post-hook 'systemctl start postfix dovecot opendkim'
systemctl restart postfix dovecot opendkim
pm2 restart qhub
```

При следующих деплоях `vps-deploy.sh` проверит, установлена ли почта, и при необходимости запустит bootstrap.

---

## DNS (обязательно до приёма писем)

| Запись | Тип | Значение |
|--------|-----|----------|
| `mail.qhub.kz` | A | `65.108.215.248` |
| `qhub.kz` | MX | `10 mail.qhub.kz.` |
| `qhub.kz` | TXT | `v=spf1 mx a:mail.qhub.kz ~all` |
| `default._domainkey.qhub.kz` | TXT | из вывода `mail-bootstrap.sh` |
| `_dmarc.qhub.kz` | TXT | `v=DMARC1; p=quarantine; rua=mailto:postmaster@qhub.kz` |

Проверка DKIM после отправки тестового письма: заголовок `DKIM-Signature` и [mail-tester.com](https://www.mail-tester.com).

---

## Hetzner: порт 25

Hetzner иногда **блокирует исходящий SMTP на порт 25** для новых серверов. Симптом: входящая почта работает, исходящая — нет.

1. Hetzner Cloud → Support → запрос на разблокировку порта 25 для VPS.
2. В облачном **Firewall** Hetzner открыть TCP 25, 587, 993 (UFW на VPS недостаточно, если есть cloud firewall).

---

## Переменные окружения

```env
MAIL_ENABLED=1
MAIL_DOMAIN=qhub.kz
MAIL_HOST=mail.qhub.kz
MAIL_ADD_COMMAND=bash /var/www/qhub.kz/scripts/mail/mail-add.sh
MAIL_PASSWD_COMMAND=bash /var/www/qhub.kz/scripts/mail/mail-passwd.sh
MAIL_LIST_COMMAND=bash /var/www/qhub.kz/scripts/mail/mail-list.sh
MAIL_REMOVE_COMMAND=bash /var/www/qhub.kz/scripts/mail/mail-remove.sh
```

`mail-bootstrap.sh` дописывает их в `.env.production` автоматически.

---

## Создание нового ящика

### Через админку (рекомендуется)

1. **https://www.qhub.kz/qhub-ctrl-7k2m** → вкладка **Messenger**
2. Блок **«Почта @qhub.kz»** → email + начальный пароль → **Создать ящик**
3. Отправить пользователю:
   - адрес `user@qhub.kz`
   - пароль
   - ссылку на смену пароля: **https://www.qhub.kz/tools/mail/password**
   - настройки клиента (ниже)

### Через SSH

```bash
bash /var/www/qhub.kz/scripts/mail/mail-add.sh user@qhub.kz 'InitialPassword123'
bash /var/www/qhub.kz/scripts/mail/mail-list.sh
```

---

## Смена пароля пользователем

### Через сайт

**https://www.qhub.kz/tools/mail/password**

- email `@qhub.kz`
- текущий пароль
- новый пароль (мин. 8 символов)

Rate limit: 10 попыток в час с одного IP.

### Через SSH (админ, без текущего пароля)

```bash
bash /var/www/qhub.kz/scripts/mail/mail-passwd.sh user@qhub.kz 'NewPassword123'
```

### Через SSH (с проверкой текущего)

```bash
bash /var/www/qhub.kz/scripts/mail/mail-passwd.sh --verify user@qhub.kz 'OldPass' 'NewPass'
```

---

## Настройки почтового клиента

| Параметр | Значение |
|----------|----------|
| IMAP-сервер | `mail.qhub.kz` |
| IMAP-порт | `993` |
| IMAP-безопасность | SSL/TLS |
| SMTP-сервер | `mail.qhub.kz` |
| SMTP-порт | `587` |
| SMTP-безопасность | STARTTLS |
| Логин | полный email `user@qhub.kz` |
| Пароль | пароль ящика |

---

## Удаление ящика

**Админка** → список ящиков → **Удалить**

Или SSH:

```bash
bash /var/www/qhub.kz/scripts/mail/mail-remove.sh user@qhub.kz
# с удалением файлов писем:
bash /var/www/qhub.kz/scripts/mail/mail-remove.sh user@qhub.kz --purge
```

---

## Файлы на сервере

| Путь | Назначение |
|------|------------|
| `/var/mail/vhosts/qhub.kz/` | Maildir пользователей |
| `/etc/dovecot/users` | Хеши паролей (SHA512-CRYPT) |
| `/etc/postfix/virtual_mailboxes` | Карта ящиков Postfix |
| `/etc/opendkim/keys/qhub.kz/` | DKIM-ключи |

---

## Проверка и логи

```bash
# Службы
systemctl status postfix dovecot opendkim

# Тест авторизации
doveadm auth test user@qhub.kz 'password'

# Логи
tail -f /var/log/mail.log
journalctl -u postfix -f

# Health-check всего VPS
python3 /var/www/qhub.kz/scripts/deploy/vps-health-check.py
```

---

## Связанные файлы в репозитории

| Файл | Назначение |
|------|------------|
| `scripts/deploy/mail-bootstrap.sh` | Первичная установка |
| `scripts/mail/mail-add.sh` | Создать ящик |
| `scripts/mail/mail-passwd.sh` | Сменить пароль |
| `scripts/mail/mail-list.sh` | Список ящиков (JSON) |
| `scripts/mail/mail-remove.sh` | Удалить ящик |
| `src/app/api/admin/mail/*` | API для админки |
| `src/app/api/mail/change-password` | Self-service смена пароля |
| `src/app/tools/mail/password` | Страница смены пароля |
| `docs/vps.md` | Общая схема VPS |
