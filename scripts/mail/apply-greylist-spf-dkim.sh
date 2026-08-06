#!/bin/bash
# Apply greylist bypass for SPF/DKIM/DMARC-valid inbound mail.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
CONFIG_DIR="${APP_DIR}/scripts/mail/config"

if ! command -v rspamd >/dev/null 2>&1; then
  echo "rspamd not installed — skip" >&2
  exit 0
fi

install -d -m 0755 /etc/rspamd/local.d

if [ -f "${CONFIG_DIR}/rspamd-greylist.conf" ]; then
  cp "${CONFIG_DIR}/rspamd-greylist.conf" /etc/rspamd/local.d/greylist.conf
fi
if [ -f "${CONFIG_DIR}/rspamd-settings-greylist.conf" ]; then
  cp "${CONFIG_DIR}/rspamd-settings-greylist.conf" /etc/rspamd/local.d/settings-greylist.conf
fi

if command -v rspamadm >/dev/null 2>&1; then
  rspamadm configtest
fi

systemctl reload rspamd
echo "==> Greylist: skip for R_SPF_ALLOW / R_DKIM_ALLOW / DMARC_POLICY_ALLOW"
