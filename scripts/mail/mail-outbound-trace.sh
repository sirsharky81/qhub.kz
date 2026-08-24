#!/bin/bash
# Trace outbound mail from QHub — queue, bounces, large messages, submission timing.
set -euo pipefail

LOG="${MAIL_LOG:-/var/log/mail.log}"
SENDER="${1:-boris@qhub.kz}"

if [ ! -r "$LOG" ]; then
  echo "Cannot read $LOG" >&2
  exit 1
fi

echo "==> Outbound mail trace for ${SENDER}"
echo "==> Log: $LOG"
echo ""

echo "==> Postfix queue"
mailq 2>/dev/null || postqueue -p 2>/dev/null || echo "(mailq unavailable)"
for dir in deferred active hold corrupt; do
  count="$(find "/var/spool/postfix/${dir}" -type f 2>/dev/null | wc -l)"
  echo "${dir}: ${count} file(s)"
done
echo ""

echo "==> Recent outbound accepts (qmgr) from ${SENDER}"
grep -Fi "from=<${SENDER}>" "$LOG" 2>/dev/null | grep 'postfix/qmgr' | tail -15 || echo "(none)"
echo ""

echo "==> Recent authenticated uploads (587 submission + 465 smtps)"
grep -E 'postfix/(submission|smtps)/smtpd' "$LOG" 2>/dev/null | grep -Fi "$SENDER" | tail -15 || echo "(none)"
echo ""

echo "==> Large messages (>400 KB) from ${SENDER}"
grep -Fi "from=<${SENDER}>" "$LOG" 2>/dev/null | grep -E 'size=[0-9]{6,}' | tail -15 || echo "(none)"
echo ""

echo "==> Full lifecycle for recent queue IDs from ${SENDER}"
mapfile -t qids < <(grep -Fi "from=<${SENDER}>" "$LOG" 2>/dev/null | grep 'postfix/qmgr' | grep -oE '[A-F0-9]{8,12}' | tail -5 | sort -u)
if [ ${#qids[@]} -eq 0 ]; then
  echo "(no recent queue ids)"
else
  for qid in "${qids[@]}"; do
    echo "── queue id: $qid ──"
    grep "$qid" "$LOG" 2>/dev/null | grep -E 'postfix/(smtps|submission|cleanup|qmgr|smtp|bounce|error|local|virtual|lmtp)' || echo "(no matching lines)"
    echo ""
  done
fi

echo "==> Recent outbound SMTP delivery attempts (any sender, last 30)"
grep 'postfix/smtp\[' "$LOG" 2>/dev/null | grep -E 'status=(sent|bounced|deferred)' | tail -30 || echo "(none)"
echo ""

echo "==> Bounces / rejects mentioning ${SENDER}"
grep -Fi "$SENDER" "$LOG" 2>/dev/null | grep -iE 'status=bounced|reject|550 |552 |554 |421 |451 |warning:|connect to|Connection timed out|Network is unreachable' | tail -25 || echo "(none)"
echo ""

echo "==> Postfix journal (last 40 lines, outbound errors)"
journalctl -u postfix --no-pager -n 40 2>/dev/null | grep -iE 'smtp|deferred|bounce|fatal|error|61835|connect' || echo "(journal unavailable or no matches)"
