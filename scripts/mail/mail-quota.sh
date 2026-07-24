#!/bin/bash
# Set mailbox storage quota.
# Usage: mail-quota.sh user@qhub.kz 2G
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root" >&2
  exit 1
fi

EMAIL="${1:-}"
QUOTA="${2:-}"

if [ -z "$EMAIL" ] || [ -z "$QUOTA" ]; then
  echo "Usage: $0 user@${MAIL_DOMAIN} 1G" >&2
  exit 1
fi

if [[ ! "$QUOTA" =~ ^[0-9]+[KMG]?$ ]]; then
  echo "Invalid quota format: $QUOTA (examples: 512M, 1G, 2G)" >&2
  exit 1
fi

EMAIL="${EMAIL,,}"
if [ ! -f "$DOVECOT_USERS" ] || ! grep -qi "^${EMAIL}:" "$DOVECOT_USERS"; then
  echo "Mailbox not found: $EMAIL" >&2
  exit 1
fi

EXISTING="$(grep -i "^${EMAIL}:" "$DOVECOT_USERS" | head -n1)"
HASH="$(printf '%s' "$EXISTING" | awk -F: '{print $2}')"
mail_replace_user "$EMAIL" "$(mail_user_line "$EMAIL" "$HASH" "$QUOTA")"
systemctl reload dovecot

echo "Quota for $EMAIL set to $QUOTA"
