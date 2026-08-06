#!/bin/bash
# Authenticated SMTP (587): OpenDKIM only — skip Rspamd for faster mobile send.
# Rspamd stays on port 25 (inbound antispam).
set -euo pipefail

MASTER=/etc/postfix/master.cf
MAIN=/etc/postfix/main.cf

if [ ! -f "$MASTER" ]; then
  echo "postfix master.cf not found — mail stack not installed?" >&2
  exit 1
fi

# submission service block only (do not touch smtp/25 milters)
sed -i '/^submission inet/,/^[^[:space:]]/ s|smtpd_milters=inet:127.0.0.1:11332,inet:127.0.0.1:8891|smtpd_milters=inet:127.0.0.1:8891|' "$MASTER"

if [ -f "$MAIN" ]; then
  sed -i 's|# Rspamd antispam (inbound + authenticated)|# Rspamd antispam (inbound port 25; submission 587 = OpenDKIM only)|' "$MAIN" || true
fi

postfix check
systemctl reload postfix
echo "==> Fast submission: port 587 uses OpenDKIM only (Rspamd skipped for authenticated send)"
