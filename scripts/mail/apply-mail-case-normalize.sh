#!/bin/bash
# Make inbound mail and IMAP auth case-insensitive for @qhub.kz addresses.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

MAIN=/etc/postfix/main.cf
PCRE_DST=/etc/postfix/recipient_canonical_maps.pcre
DOVECOT_AUTH_SRC="${SCRIPT_DIR}/config/dovecot-auth-passwdfile.conf.ext"
DOVECOT_AUTH_DST=/etc/dovecot/conf.d/auth-passwdfile.conf.ext

if [ ! -f "$MAIN" ]; then
  echo "postfix main.cf not found — mail stack not installed?" >&2
  exit 1
fi

install -m 0644 "$DOVECOT_AUTH_SRC" "$DOVECOT_AUTH_DST"

if ! grep -q '^recipient_canonical_maps' "$MAIN"; then
  cat >>"$MAIN" <<EOF

# Case-insensitive local part for @${MAIL_DOMAIN}
recipient_canonical_maps = pcre:/etc/postfix/recipient_canonical_maps.pcre
recipient_canonical_classes = envelope_recipient, header_recipient
EOF
fi

mail_regenerate_canonical_pcre "$PCRE_DST"
echo "==> recipient_canonical_maps.pcre entries: $(grep -c '^/^(?i)' "$PCRE_DST" || true)"

postfix check
systemctl reload postfix
systemctl reload dovecot
echo "==> Mail case normalization applied (Postfix recipient_canonical + Dovecot %Lu)"
