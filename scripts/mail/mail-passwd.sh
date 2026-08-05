#!/bin/bash
# Change mailbox password.
# Usage:
#   mail-passwd.sh user@qhub.kz 'new-password'
#   mail-passwd.sh --verify user@qhub.kz 'current-password' 'new-password'
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root" >&2
  exit 1
fi

VERIFY=0
if [ "${1:-}" = "--verify" ]; then
  VERIFY=1
  shift
fi

EMAIL="${1:-}"
CURRENT="${2:-}"
NEW="${3:-}"

if [ "$VERIFY" -eq 0 ]; then
  NEW="$CURRENT"
  CURRENT=""
fi

if [ -z "$EMAIL" ] || [ -z "$NEW" ]; then
  echo "Usage: $0 user@${MAIL_DOMAIN} 'new-password'" >&2
  echo "       $0 --verify user@${MAIL_DOMAIN} 'current-password' 'new-password'" >&2
  exit 1
fi

if [ "${#NEW}" -lt 8 ]; then
  echo "New password must be at least 8 characters" >&2
  exit 1
fi

EMAIL="${EMAIL,,}"
if [ ! -f "$DOVECOT_USERS" ] || ! grep -qi "^${EMAIL}:" "$DOVECOT_USERS"; then
  echo "Mailbox not found: $EMAIL" >&2
  exit 1
fi

if [ "$VERIFY" -eq 1 ]; then
  if ! mail_verify_password "$EMAIL" "$CURRENT"; then
    echo "Current password is incorrect" >&2
    exit 1
  fi
fi

HASH="$(mail_hash_password "$NEW")"
EXISTING="$(grep -i "^${EMAIL}:" "$DOVECOT_USERS" | head -n1)"
QUOTA="$MAIL_DEFAULT_QUOTA"
EXTRA="$(printf '%s' "$EXISTING" | awk -F: '{print $7}')"
if [[ "$EXTRA" =~ storage=([^[:space:]]+) ]]; then
  QUOTA="${BASH_REMATCH[1]}"
fi
mail_replace_user "$EMAIL" "$(mail_user_line "$EMAIL" "$HASH" "$QUOTA")"
systemctl reload dovecot

echo "Password updated for $EMAIL"
