#!/bin/bash
# Create or reset a mailbox on the QHub VPS.
# Usage: mail-add.sh user@qhub.kz 'initial-password'
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root" >&2
  exit 1
fi

EMAIL="${1:-}"
PASSWORD="${2:-}"

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  echo "Usage: $0 user@${MAIL_DOMAIN} 'password'" >&2
  exit 1
fi

if [ "${#PASSWORD}" -lt 8 ]; then
  echo "Password must be at least 8 characters" >&2
  exit 1
fi

EMAIL="${EMAIL,,}"
mail_ensure_runtime

HOME_DIR="$(mail_home_dir "$EMAIL")"
install -d -m 0700 -o vmail -g mail "$HOME_DIR"
install -d -m 0700 -o vmail -g mail "${HOME_DIR}cur" "${HOME_DIR}new" "${HOME_DIR}tmp"

HASH="$(mail_hash_password "$PASSWORD")"
mail_replace_user "$EMAIL" "$(mail_user_line "$EMAIL" "$HASH" "$MAIL_DEFAULT_QUOTA")"
mail_replace_postfix_entry "$EMAIL" "$(mail_postfix_entry "$EMAIL")"
grep -qxF "$MAIL_DOMAIN	OK" "$POSTFIX_DOMAINS" 2>/dev/null || echo "$MAIL_DOMAIN	OK" >>"$POSTFIX_DOMAINS"

mail_reload_services

echo "Mailbox ready: $EMAIL"
echo "IMAP: mail.${MAIL_DOMAIN}:993 (SSL)"
echo "SMTP: mail.${MAIL_DOMAIN}:587 (STARTTLS)"
