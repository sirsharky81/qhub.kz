#!/bin/bash
# QHub corporate mail — docker-mailserver on VPS (variant A)
# Run as root on the Hetzner VPS once DNS A record mail.qhub.kz → this host is planned.
set -euo pipefail

MAIL_DOMAIN="${MAIL_DOMAIN:-qhub.kz}"
MAIL_HOSTNAME="${MAIL_HOSTNAME:-mail.qhub.kz}"
MAIL_DIR="${MAIL_DIR:-/opt/mailserver}"
VPS_IP="${VPS_IP:-65.108.215.248}"
MAILBOX="${MAILBOX:-}"
MAIL_PASSWORD="${MAIL_PASSWORD:-}"

export DEBIAN_FRONTEND=noninteractive

echo "==> QHub mail bootstrap (${MAIL_HOSTNAME})"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "${VERSION_CODENAME:-$VERSION_ID}") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi

mkdir -p "${MAIL_DIR}/docker-data/dms/{mail-data,mail-state,mail-logs,config}"
cd "${MAIL_DIR}"

if [ ! -f docker-compose.yml ]; then
  echo "==> Fetching docker-mailserver compose files..."
  curl -fsSL -o docker-compose.yml \
    https://raw.githubusercontent.com/docker-mailserver/docker-mailserver/master/docker-compose.yml
  curl -fsSL -o mailserver.env \
    https://raw.githubusercontent.com/docker-mailserver/docker-mailserver/master/mailserver.env
fi

# Idempotent env tweaks
touch mailserver.env
grep -q '^ENABLE_RSPAMD=' mailserver.env || echo 'ENABLE_RSPAMD=1' >> mailserver.env
grep -q '^ENABLE_CLAMAV=' mailserver.env || echo 'ENABLE_CLAMAV=0' >> mailserver.env
grep -q '^SSL_TYPE=' mailserver.env || echo 'SSL_TYPE=letsencrypt' >> mailserver.env
grep -q '^POSTMASTER_ADDRESS=' mailserver.env || echo "POSTMASTER_ADDRESS=postmaster@${MAIL_DOMAIN}" >> mailserver.env

sed -i "s/^#\\?ENABLE_RSPAMD=.*/ENABLE_RSPAMD=1/" mailserver.env 2>/dev/null || true
sed -i "s/^#\\?ENABLE_CLAMAV=.*/ENABLE_CLAMAV=0/" mailserver.env 2>/dev/null || true
sed -i "s/^#\\?SSL_TYPE=.*/SSL_TYPE=letsencrypt/" mailserver.env 2>/dev/null || true

export DMS_RELEASE="${DMS_RELEASE:-latest}"
docker compose up -d

echo "==> Waiting for mailserver container..."
for _ in $(seq 1 30); do
  if docker ps --format '{{.Names}}' | grep -qx mailserver; then
    break
  fi
  sleep 2
done

if ! docker ps --format '{{.Names}}' | grep -qx mailserver; then
  echo "mailserver container failed to start. Check: docker compose logs" >&2
  exit 1
fi

if command -v ufw >/dev/null 2>&1; then
  echo "==> Opening UFW ports 25, 587, 993..."
  ufw allow 25/tcp comment 'SMTP' >/dev/null 2>&1 || true
  ufw allow 587/tcp comment 'Submission' >/dev/null 2>&1 || true
  ufw allow 993/tcp comment 'IMAPS' >/dev/null 2>&1 || true
fi

echo "==> Generating DKIM (add TXT to Ps.kz after this)..."
docker exec mailserver setup config dkim domain "${MAIL_DOMAIN}" selector mail 2>/dev/null || \
  docker exec mailserver setup config dkim 2>/dev/null || true

if [ -n "${MAILBOX}" ]; then
  if [ -z "${MAIL_PASSWORD}" ]; then
    MAIL_PASSWORD="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9@#%+' | head -c 20)"
    echo "${MAIL_PASSWORD}" > "/root/.mail_password_$(echo "${MAILBOX}" | tr '@.' '__')"
    chmod 600 "/root/.mail_password_$(echo "${MAILBOX}" | tr '@.' '__')"
    echo "==> Generated password saved to /root/.mail_password_*"
  fi
  echo "==> Creating mailbox ${MAILBOX}..."
  docker exec mailserver setup email add "${MAILBOX}" "${MAIL_PASSWORD}"
fi

echo ""
echo "=============================================="
echo "Mail bootstrap done."
echo ""
echo "DNS on Ps.kz (domain ${MAIL_DOMAIN}):"
echo "  A    mail     -> ${VPS_IP}"
echo "  MX   @        -> ${MAIL_HOSTNAME} (priority 10)"
echo "  TXT  @        -> v=spf1 ip4:${VPS_IP} -all"
echo "  TXT  _dmarc    -> v=DMARC1; p=quarantine; rua=mailto:boris@${MAIL_DOMAIN}"
echo ""
echo "Hetzner: set reverse DNS (PTR) for ${VPS_IP} -> ${MAIL_HOSTNAME}"
echo ""
echo "DKIM public key (add as TXT mail._domainkey):"
if [ -f "${MAIL_DIR}/docker-data/dms/config/opendkim/keys/${MAIL_DOMAIN}/mail.txt" ]; then
  cat "${MAIL_DIR}/docker-data/dms/config/opendkim/keys/${MAIL_DOMAIN}/mail.txt"
else
  echo "  Run: docker exec mailserver cat /tmp/docker-mailserver/opendkim/keys/${MAIL_DOMAIN}/mail.txt"
  echo "  Or:  ls ${MAIL_DIR}/docker-data/dms/config/opendkim/keys/"
fi
echo ""
echo "Create more mailboxes:"
echo "  docker exec -it mailserver setup email add user@${MAIL_DOMAIN}"
echo ""
echo "Health check:"
echo "  python3 /var/www/qhub.kz/scripts/deploy/vps-health-check.py"
echo "=============================================="
