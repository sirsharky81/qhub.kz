#!/bin/bash
# Create standard IMAP folders for a mailbox (Sent, Drafts, Trash).
# Usage: mail-init-folders.sh user@qhub.kz
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root" >&2
  exit 1
fi

EMAIL="${1:-}"
if [ -z "$EMAIL" ]; then
  echo "Usage: $0 user@${MAIL_DOMAIN}" >&2
  exit 1
fi

EMAIL="${EMAIL,,}"
mail_ensure_runtime

if ! grep -qi "^${EMAIL}:" "$DOVECOT_USERS"; then
  echo "Mailbox not found: $EMAIL" >&2
  exit 1
fi

for folder in Sent Drafts Trash; do
  if doveadm mailbox list -u "$EMAIL" 2>/dev/null | grep -qx "$folder"; then
    echo "Exists: $folder"
  else
    doveadm mailbox create -u "$EMAIL" "$folder"
    echo "Created: $folder"
  fi
  doveadm mailbox subscribe -u "$EMAIL" "$folder" 2>/dev/null || true
done

echo "Folders for $EMAIL:"
doveadm mailbox list -u "$EMAIL"
