#!/bin/bash
# Trace outbound mail from QHub — queue, bounces, large messages, submission timing.
set -euo pipefail

LOG="${MAIL_LOG:-/var/log/mail.log}"
SENDER="${1:-boris@qhub.kz}"
HOURS="${2:-24}"

if [ ! -r "$LOG" ]; then
  echo "Cannot read $LOG" >&2
  exit 1
fi

echo "==> Outbound mail trace for ${SENDER} (last ${HOURS}h)"
echo "==> Log: $LOG"
echo ""

echo "==> Postfix queue"
mailq 2>/dev/null || postqueue -p 2>/dev/null || echo "(mailq unavailable)"
for dir in deferred active hold corrupt; do
  count="$(find "/var/spool/postfix/${dir}" -type f 2>/dev/null | wc -l)"
  echo "${dir}: ${count} file(s)"
done
echo ""

echo "==> Outbound status lines (sent / bounced / deferred) from ${SENDER}"
grep -Fi "from=<${SENDER}>" "$LOG" 2>/dev/null | grep -E 'postfix/(smtp|submission|qmgr|bounce|error)' | tail -60 || echo "(none)"
echo ""

echo "==> Delivery results to remote MTAs (status=)"
grep -Fi "from=<${SENDER}>" "$LOG" 2>/dev/null | grep 'postfix/smtp\[' | grep -E 'status=(sent|bounced|deferred)' | tail -30 || echo "(none)"
echo ""

echo "==> Large messages (>5 MB) from ${SENDER}"
grep -Fi "from=<${SENDER}>" "$LOG" 2>/dev/null | grep -E 'size=[0-9]{7,}' | tail -20 || echo "(none)"
echo ""

echo "==> Submission port (587) — recent accepts from ${SENDER}"
grep 'postfix/submission' "$LOG" 2>/dev/null | grep -Fi "$SENDER" | tail -20 || echo "(none)"
echo ""

echo "==> Bounces / rejects mentioning ${SENDER}"
grep -Fi "$SENDER" "$LOG" 2>/dev/null | grep -iE 'status=bounced|reject|550 |552 |554 |421 |451 |warning:' | tail -25 || echo "(none)"
echo ""

echo "==> Deferred queue details (if any)"
if mailq 2>/dev/null | grep -q 'Mail queue is empty'; then
  echo "Queue empty — nothing stuck on server."
else
  mailq 2>/dev/null || postqueue -p 2>/dev/null || true
fi
