#!/bin/bash
# Create standard IMAP folders for a mailbox (Sent Items, Drafts, Trash).
# Outlook desktop/mobile expects "Sent Items", not "Sent".
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

list_mailboxes() {
  doveadm mailbox list -u "$EMAIL" 2>/dev/null
}

has_mailbox() {
  list_mailboxes | grep -Fxq "$1"
}

# Migrate legacy "Sent" → "Sent Items" (Outlook iOS/desktop)
if has_mailbox "Sent"; then
  if has_mailbox "Sent Items"; then
    echo "Both Sent and Sent Items exist — keeping Sent Items"
  else
    doveadm mailbox rename -u "$EMAIL" Sent "Sent Items"
    echo "Renamed: Sent -> Sent Items"
  fi
fi

for folder in "Sent Items" Drafts Trash; do
  if has_mailbox "$folder"; then
    echo "Exists: $folder"
  else
    doveadm mailbox create -u "$EMAIL" "$folder"
    echo "Created: $folder"
  fi
  doveadm mailbox subscribe -u "$EMAIL" "$folder" 2>/dev/null || true
done

echo "Folders for $EMAIL:"
list_mailboxes
