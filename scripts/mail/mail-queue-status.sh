#!/bin/bash
# Inspect or purge Postfix queue (admin/debug).
# Usage:
#   mail-queue-status.sh
#   mail-queue-status.sh --purge-deferred   # delete ALL deferred mail (careful)
set -euo pipefail

PURGE=0
if [ "${1:-}" = "--purge-deferred" ]; then
  PURGE=1
fi

echo "==> Postfix queue"
mailq 2>/dev/null || postqueue -p 2>/dev/null || echo "(mailq unavailable)"

for dir in deferred active hold corrupt; do
  count="$(find "/var/spool/postfix/${dir}" -type f 2>/dev/null | wc -l)"
  echo "${dir}: ${count} file(s)"
done

echo ""
echo "==> Recent boris@qhub.kz in mail.log (last 25 lines)"
grep "boris@qhub.kz" /var/log/mail.log 2>/dev/null | tail -25 || echo "(no matches)"

if [ "$PURGE" -eq 1 ]; then
  echo ""
  echo "==> Purging deferred queue..."
  postsuper -d ALL deferred
  echo "Done. New queue:"
  mailq 2>/dev/null || postqueue -p 2>/dev/null || true
fi
