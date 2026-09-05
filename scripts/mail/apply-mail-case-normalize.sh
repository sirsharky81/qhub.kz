#!/bin/bash
# Make inbound mail and IMAP auth case-insensitive for @qhub.kz addresses.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAIL_DOMAIN="${MAIL_DOMAIN:-qhub.kz}"
MAIN=/etc/postfix/main.cf
PCRE_SRC="${SCRIPT_DIR}/config/postfix-recipient-canonical.pcre"
PCRE_DST=/etc/postfix/recipient_canonical_maps.pcre
DOVECOT_AUTH_SRC="${SCRIPT_DIR}/config/dovecot-auth-passwdfile.conf.ext"
DOVECOT_AUTH_DST=/etc/dovecot/conf.d/auth-passwdfile.conf.ext

if [ ! -f "$MAIN" ]; then
  echo "postfix main.cf not found — mail stack not installed?" >&2
  exit 1
fi

install -m 0644 "$PCRE_SRC" "$PCRE_DST"
install -m 0644 "$DOVECOT_AUTH_SRC" "$DOVECOT_AUTH_DST"

# Escape domain for sed (only dots matter here).
DOMAIN_RE="$(printf '%s' "$MAIL_DOMAIN" | sed 's/\./\\./g')"

if ! grep -q '^recipient_canonical_maps' "$MAIN"; then
  cat >>"$MAIN" <<EOF

# Case-insensitive local part for @${MAIL_DOMAIN}
recipient_canonical_maps = pcre:/etc/postfix/recipient_canonical_maps.pcre
recipient_canonical_classes = envelope_recipient, header_recipient
EOF
fi

# Regenerate domain-specific pcre if MAIL_DOMAIN differs from default template.
if [ "$MAIL_DOMAIN" != "qhub.kz" ]; then
  printf '/^(.*)@%s$/i    ${1}@%s\n' "$DOMAIN_RE" "$MAIL_DOMAIN" >"$PCRE_DST"
fi

postfix check
systemctl reload postfix
systemctl reload dovecot
echo "==> Mail case normalization applied (Postfix recipient_canonical + Dovecot %Lu)"
