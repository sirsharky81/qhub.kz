#!/bin/bash
# Postfix + Dovecot + OpenDKIM bootstrap for QHub VPS — run as root once
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
MAIL_DOMAIN="${MAIL_DOMAIN:-qhub.kz}"
MAIL_HOST="${MAIL_HOST:-mail.${MAIL_DOMAIN}}"
VMUID="${MAIL_VMUID:-5000}"
VMGID="${MAIL_VMGID:-5000}"
MAIL_VHOSTS="/var/mail/vhosts/${MAIL_DOMAIN}"
DKIM_DIR="/etc/opendkim/keys/${MAIL_DOMAIN}"
ENV_FILE="${APP_DIR}/.env.production"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq postfix postfix-pcre dovecot-core dovecot-imapd dovecot-lmtpd opendkim opendkim-tools certbot

id -u vmail >/dev/null 2>&1 || useradd -r -u "$VMUID" -g mail -d "$MAIL_VHOSTS" -s /usr/sbin/nologin vmail
install -d -m 0750 -o vmail -g mail "$MAIL_VHOSTS"
install -d -m 0750 -o root -g dovecot /etc/dovecot/users.d
touch /etc/dovecot/users
chmod 640 /etc/dovecot/users
chown root:dovecot /etc/dovecot/users

cat >/etc/postfix/main.cf <<EOF
smtpd_banner = \$myhostname ESMTP QHub Mail
biff = no
append_dot_mydomain = no
readme_directory = no
compatibility_level = 3.6

myhostname = ${MAIL_HOST}
myorigin = ${MAIL_DOMAIN}
mydestination = localhost
mynetworks = 127.0.0.0/8 [::1]/128
inet_interfaces = all
inet_protocols = ipv4

virtual_mailbox_domains = ${MAIL_DOMAIN}
virtual_mailbox_maps = hash:/etc/postfix/virtual_mailboxes
virtual_mailbox_base = /var/mail/vhosts
virtual_minimum_uid = ${VMUID}
virtual_uid_maps = static:${VMUID}
virtual_gid_maps = static:${VMGID}
virtual_transport = lmtp:unix:private/dovecot-lmtp

smtpd_tls_security_level = may
smtp_tls_security_level = may
smtpd_tls_cert_file = /etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/${MAIL_HOST}/privkey.pem
smtpd_tls_session_cache_database = btree:\${data_directory}/smtpd_scache
smtp_tls_session_cache_database = btree:\${data_directory}/smtp_scache

smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes
smtpd_relay_restrictions = permit_mynetworks, permit_sasl_authenticated, defer_unauth_destination

smtpd_milters = inet:127.0.0.1:8891
non_smtpd_milters = inet:127.0.0.1:8891
milter_default_action = accept
milter_protocol = 6

message_size_limit = 26214400
mailbox_size_limit = 0
recipient_delimiter = +
EOF

cat >/etc/postfix/master.cf <<'EOF'
smtp      inet  n       -       y       -       -       smtpd
submission inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_relay_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING
pickup    unix  n       -       y       60      1       pickup
cleanup   unix  n       -       y       -       0       cleanup
qmgr      unix  n       -       n       300     1       qmgr
tlsmgr    unix  -       -       y       1000?   1       tlsmgr
rewrite   unix  -       -       y       -       -       trivial-rewrite
bounce    unix  -       -       y       -       0       bounce
defer     unix  -       -       y       -       0       bounce
trace     unix  -       -       y       -       0       bounce
verify    unix  -       -       y       -       1       verify
flush     unix  n       -       y       1000?   0       flush
proxymap  unix  -       -       n       -       -       proxymap
proxywrite unix -       -       n       -       1       proxymap
smtp      unix  -       -       y       -       -       smtp
relay     unix  -       -       y       -       -       smtp
showq     unix  n       -       y       -       -       showq
error     unix  -       -       y       -       -       error
retry     unix  -       -       y       -       -       error
discard   unix  -       -       y       -       -       discard
local     unix  -       n       n       -       -       local
virtual   unix  -       n       n       -       -       virtual
lmtp      unix  -       -       y       -       -       lmtp
anvil     unix  -       -       y       -       1       anvil
scache    unix  -       -       y       -       1       scache
postlog   unix-dgram n  -       n       -       1       postlog
dovecot   unix  -       n       n       -       -       pipe
  flags=DRhu user=vmail:mail argv=/usr/lib/dovecot/deliver -f ${sender} -d ${recipient}
EOF

touch /etc/postfix/virtual_mailboxes /etc/postfix/virtual_mailbox_domains
echo "${MAIL_DOMAIN}	OK" >/etc/postfix/virtual_mailbox_domains
postmap /etc/postfix/virtual_mailbox_domains
postmap /etc/postfix/virtual_mailboxes

cat >/etc/dovecot/conf.d/10-mail.conf <<EOF
mail_location = maildir:${MAIL_VHOSTS}/%n
mail_privileged_group = mail
first_valid_uid = ${VMUID}
last_valid_uid = ${VMUID}
EOF

cat >/etc/dovecot/conf.d/10-auth.conf <<'EOF'
disable_plaintext_auth = yes
auth_mechanisms = plain login
!include auth-passwdfile.conf.ext
EOF

cat >/etc/dovecot/conf.d/auth-passwdfile.conf.ext <<'EOF'
passdb {
  driver = passwd-file
  args = scheme=SHA512-CRYPT username_format=%u /etc/dovecot/users
}
userdb {
  driver = passwd-file
  args = username_format=%u /etc/dovecot/users
}
EOF

cat >/etc/dovecot/conf.d/10-master.conf <<'EOF'
service imap-login {
  inet_listener imap {
    port = 0
  }
  inet_listener imaps {
    port = 993
    ssl = yes
  }
}

service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600
    user = postfix
    group = postfix
  }
}

service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0666
    user = postfix
    group = postfix
  }
  unix_listener auth-userdb {
    mode = 0600
    user = vmail
  }
  user = dovecot
}

service auth-worker {
  user = vmail
}
EOF

cat >/etc/dovecot/conf.d/10-ssl.conf <<EOF
ssl = required
ssl_cert = </etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem
ssl_key = </etc/letsencrypt/live/${MAIL_HOST}/privkey.pem
ssl_min_protocol = TLSv1.2
EOF

mkdir -p "$DKIM_DIR"
if [ ! -f "${DKIM_DIR}/default.private" ]; then
  opendkim-genkey -b 2048 -d "${MAIL_DOMAIN}" -D "$DKIM_DIR" -s default -v
  chown -R opendkim:opendkim "/etc/opendkim/keys"
fi

cat >/etc/opendkim.conf <<EOF
Syslog yes
SyslogSuccess yes
LogWhy yes
Canonicalization relaxed/simple
Mode sv
SubDomains no
AutoRestart yes
AutoRestartRate 10/1M
Background yes
DNSTimeout 5
SignatureAlgorithm rsa-sha256
KeyTable /etc/opendkim/KeyTable
SigningTable refile:/etc/opendkim/SigningTable
ExternalIgnoreList refile:/etc/opendkim/TrustedHosts
InternalHosts refile:/etc/opendkim/TrustedHosts
Socket inet:8891@127.0.0.1
UserID opendkim
UMask 002
PidFile /run/opendkim/opendkim.pid
OversignHeaders From
EOF

cat >/etc/opendkim/KeyTable <<EOF
default._domainkey.${MAIL_DOMAIN} ${MAIL_DOMAIN}:default:${DKIM_DIR}/default.private
EOF

cat >/etc/opendkim/SigningTable <<EOF
*@${MAIL_DOMAIN} default._domainkey.${MAIL_DOMAIN}
EOF

cat >/etc/opendkim/TrustedHosts <<EOF
127.0.0.1
localhost
.${MAIL_DOMAIN}
EOF

chown -R opendkim:opendkim /etc/opendkim

if command -v ufw >/dev/null 2>&1; then
  ufw allow 25/tcp || true
  ufw allow 587/tcp || true
  ufw allow 993/tcp || true
fi

systemctl enable postfix dovecot opendkim

if [ ! -f "/etc/letsencrypt/live/${MAIL_HOST}/fullchain.pem" ]; then
  echo ""
  echo "TLS certificate for ${MAIL_HOST} not found yet."
  echo "After DNS A record for ${MAIL_HOST} -> this server, run:"
  echo "  certbot certonly --standalone -d ${MAIL_HOST} --pre-hook 'systemctl stop postfix dovecot' --post-hook 'systemctl start postfix dovecot opendkim'"
  echo ""
else
  systemctl restart opendkim postfix dovecot
fi

if [ -f "$ENV_FILE" ]; then
  grep -q '^MAIL_ENABLED=' "$ENV_FILE" || echo 'MAIL_ENABLED=1' >>"$ENV_FILE"
  grep -q '^MAIL_DOMAIN=' "$ENV_FILE" || echo "MAIL_DOMAIN=${MAIL_DOMAIN}" >>"$ENV_FILE"
  grep -q '^MAIL_HOST=' "$ENV_FILE" || echo "MAIL_HOST=${MAIL_HOST}" >>"$ENV_FILE"
  grep -q '^MAIL_ADD_COMMAND=' "$ENV_FILE" || echo "MAIL_ADD_COMMAND=bash ${APP_DIR}/scripts/mail/mail-add.sh" >>"$ENV_FILE"
  grep -q '^MAIL_PASSWD_COMMAND=' "$ENV_FILE" || echo "MAIL_PASSWD_COMMAND=bash ${APP_DIR}/scripts/mail/mail-passwd.sh" >>"$ENV_FILE"
  grep -q '^MAIL_LIST_COMMAND=' "$ENV_FILE" || echo "MAIL_LIST_COMMAND=bash ${APP_DIR}/scripts/mail/mail-list.sh" >>"$ENV_FILE"
  grep -q '^MAIL_REMOVE_COMMAND=' "$ENV_FILE" || echo "MAIL_REMOVE_COMMAND=bash ${APP_DIR}/scripts/mail/mail-remove.sh" >>"$ENV_FILE"
fi

DKIM_TXT="$(tr -d '\n\t"' < "${DKIM_DIR}/default.txt" | sed 's/(//g;s/)//g;s/  */ /g')"

echo ""
echo "Mail stack installed for ${MAIL_DOMAIN}."
echo "Hostname: ${MAIL_HOST}"
echo ""
echo "DNS records to add:"
echo "  ${MAIL_HOST}.  A     <VPS IP>"
echo "  ${MAIL_DOMAIN}.  MX  10 ${MAIL_HOST}."
echo "  ${MAIL_DOMAIN}.  TXT   \"v=spf1 mx a:${MAIL_HOST} ~all\""
echo "  default._domainkey.${MAIL_DOMAIN}.  TXT  \"${DKIM_TXT}\""
echo "  _dmarc.${MAIL_DOMAIN}.  TXT  \"v=DMARC1; p=quarantine; rua=mailto:postmaster@${MAIL_DOMAIN}\""
echo ""
echo "Create mailbox:"
echo "  bash ${APP_DIR}/scripts/mail/mail-add.sh user@${MAIL_DOMAIN} 'password'"
echo ""
echo "If outbound SMTP on port 25 is blocked by Hetzner, open a support ticket to unblock it."
echo "Then: pm2 restart qhub"
