#!/bin/bash
# Trace inbound delivery for specific senders — timing, greylist, LMTP delay.
set -euo pipefail

LOG="${MAIL_LOG:-/var/log/mail.log}"
RECIPIENT="${1:-boris@qhub.kz}"
shift || true
SENDERS=("$@")
if [ ${#SENDERS[@]} -eq 0 ]; then
  SENDERS=("doping@mail.ru" "bokhmarnyy@gmail.com")
fi

if [ ! -r "$LOG" ]; then
  echo "Cannot read $LOG" >&2
  exit 1
fi

echo "==> Mail inbound trace for ${RECIPIENT}"
echo "==> Log: $LOG"
echo ""

for sender in "${SENDERS[@]}"; do
  echo "────────────────────────────────────────"
  echo "FROM: $sender"
  echo "────────────────────────────────────────"

  mapfile -t lines < <(grep -Fi "$sender" "$LOG" 2>/dev/null | tail -30)
  if [ ${#lines[@]} -eq 0 ]; then
    echo "(no log entries — sender not seen recently or different From header)"
    echo ""
    continue
  fi

  printf '%s\n' "${lines[@]}"

  # Parse queue ids linked to this sender
  ids=$(printf '%s\n' "${lines[@]}" | grep -oE '[A-F0-9]{8,12}' | sort -u | head -5)
  if [ -n "$ids" ]; then
    echo ""
    echo "-- delivery timing (delay= seconds) --"
    for qid in $ids; do
      grep "$qid" "$LOG" 2>/dev/null | grep -E 'postfix/(smtpd|cleanup|qmgr|lmtp)|greylist|451|status=' | tail -8
    done
  fi
  echo ""
done

echo "==> Greylist / 451 deferrals (last 15)"
grep -iE 'greylist|451 4\.7\.1|temporarily rejected' "$LOG" 2>/dev/null | tail -15 || echo "(none recent)"

echo ""
echo "==> Recent inbound SMTP (port 25, not submission) to ${RECIPIENT}"
grep 'postfix/smtpd\[' "$LOG" 2>/dev/null | grep -v submission | grep -Fi "$RECIPIENT" | tail -10 || \
  grep 'postfix/smtpd\[' "$LOG" 2>/dev/null | grep -v submission | tail -10

echo ""
echo "==> Recent LMTP delivery to ${RECIPIENT} (server accept → mailbox)"
grep "postfix/lmtp" "$LOG" 2>/dev/null | grep -Fi "to=<${RECIPIENT}>" | tail -10 || echo "(none recent)"
