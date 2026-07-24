#!/bin/bash
# Remove a mailbox (keeps files on disk unless --purge is passed).
# Usage: mail-remove.sh user@qhub.kz [--purge]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root" >&2
  exit 1
fi

EMAIL="${1:-}"
PURGE=0
if [ "${2:-}" = "--purge" ]; then
  PURGE=1
fi

if [ -z "$EMAIL" ]; then
  echo "Usage: $0 user@${MAIL_DOMAIN} [--purge]" >&2
  exit 1
fi

EMAIL="${EMAIL,,}"
if [ ! -f "$DOVECOT_USERS" ] || ! grep -qi "^${EMAIL}:" "$DOVECOT_USERS"; then
  echo "Mailbox not found: $EMAIL" >&2
  exit 1
fi

HOME_DIR="$(grep -i "^${EMAIL}:" "$DOVECOT_USERS" | head -n1 | awk -F: '{print $6}')"
tmp="$(mktemp)"
grep -vi "^${EMAIL}:" "$DOVECOT_USERS" >"$tmp" || true
mv "$tmp" "$DOVECOT_USERS"
chmod 640 "$DOVECOT_USERS"
chown root:dovecot "$DOVECOT_USERS"

tmp="$(mktemp)"
grep -vi "^${EMAIL}[[:space:]]" "$POSTFIX_VIRTUAL" >"$tmp" || true
mv "$tmp" "$POSTFIX_VIRTUAL"

if [ "$PURGE" -eq 1 ] && [ -n "$HOME_DIR" ] && [ -d "$HOME_DIR" ]; then
  rm -rf "$HOME_DIR"
fi

mail_reload_services
echo "Removed mailbox: $EMAIL"
