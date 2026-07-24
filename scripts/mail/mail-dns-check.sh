#!/bin/bash
# Verify MX, SPF, DKIM, DMARC and PTR for QHub mail.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

MAIL_HOST="${MAIL_HOST:-mail.${MAIL_DOMAIN}}"
PUBLIC_IP="${MAIL_VPS_IP:-$(curl -4 -fsS https://ifconfig.me 2>/dev/null || echo '')}"
DKIM_SELECTOR="${MAIL_DKIM_SELECTOR:-default}"
EXPECTED_SPF="v=spf1 mx a:${MAIL_HOST}"
if [ -n "$PUBLIC_IP" ]; then
  EXPECTED_SPF="${EXPECTED_SPF} ip4:${PUBLIC_IP}"
fi
EXPECTED_SPF="${EXPECTED_SPF} -all"
EXPECTED_DMARC="v=DMARC1"

pass=0
fail=0
warn=0

check_ok() {
  echo "OK   $1"
  pass=$((pass + 1))
}

check_fail() {
  echo "FAIL $1"
  fail=$((fail + 1))
}

check_warn() {
  echo "WARN $1"
  warn=$((warn + 1))
}

echo "Mail DNS check for ${MAIL_DOMAIN} (${MAIL_HOST}, IP ${PUBLIC_IP:-unknown})"
echo ""

MX="$(dig +short MX "${MAIL_DOMAIN}" | sort)"
if printf '%s\n' "$MX" | grep -qi "${MAIL_HOST}"; then
  check_ok "MX points to ${MAIL_HOST}"
else
  check_fail "MX missing or wrong (got: ${MX:-none})"
fi

A_RECORD="$(dig +short A "${MAIL_HOST}" | head -n1)"
if [ "$A_RECORD" = "$PUBLIC_IP" ]; then
  check_ok "A ${MAIL_HOST} -> ${A_RECORD}"
elif [ -n "$A_RECORD" ]; then
  check_warn "A ${MAIL_HOST} -> ${A_RECORD} (expected ${PUBLIC_IP})"
else
  check_fail "A record for ${MAIL_HOST} missing"
fi

SPF="$(dig +short TXT "${MAIL_DOMAIN}" | tr -d '"' | paste -sd ' ' -)"
if printf '%s' "$SPF" | grep -qi 'v=spf1'; then
  if printf '%s' "$SPF" | grep -qi -- '-all'; then
    check_ok "SPF present with -all"
  elif printf '%s' "$SPF" | grep -qi -- '~all'; then
    check_warn "SPF uses ~all (switch to -all for production)"
  else
    check_warn "SPF present but no -all/~all qualifier"
  fi
  if ! printf '%s' "$SPF" | grep -qi "$MAIL_HOST"; then
    check_warn "SPF does not include ${MAIL_HOST}"
  fi
else
  check_fail "SPF TXT missing on ${MAIL_DOMAIN}"
fi

DKIM="$(dig +short TXT "${DKIM_SELECTOR}._domainkey.${MAIL_DOMAIN}" | tr -d '"' | paste -sd '' -)"
if printf '%s' "$DKIM" | grep -qi 'v=DKIM1'; then
  check_ok "DKIM TXT present (${DKIM_SELECTOR}._domainkey)"
else
  check_fail "DKIM TXT missing (${DKIM_SELECTOR}._domainkey.${MAIL_DOMAIN})"
fi

DMARC="$(dig +short TXT "_dmarc.${MAIL_DOMAIN}" | tr -d '"' | paste -sd ' ' -)"
if printf '%s' "$DMARC" | grep -qi 'v=DMARC1'; then
  check_ok "DMARC TXT present"
  if ! printf '%s' "$DMARC" | grep -qi 'p=quarantine\|p=reject'; then
    check_warn "DMARC policy is not quarantine/reject"
  fi
else
  check_fail "DMARC TXT missing (_dmarc.${MAIL_DOMAIN})"
fi

if [ -n "$PUBLIC_IP" ]; then
  PTR="$(dig +short -x "$PUBLIC_IP" | sed 's/\.$//')"
  if [ "$PTR" = "$MAIL_HOST" ]; then
    check_ok "PTR ${PUBLIC_IP} -> ${PTR}"
  elif [ -n "$PTR" ]; then
    check_fail "PTR ${PUBLIC_IP} -> ${PTR} (expected ${MAIL_HOST})"
  else
    check_fail "PTR missing for ${PUBLIC_IP} (set rDNS in Hetzner to ${MAIL_HOST})"
  fi
else
  check_warn "MAIL_VPS_IP not set; skipped PTR check"
fi

echo ""
echo "Summary: ${pass} ok, ${warn} warn, ${fail} fail"
echo ""
echo "Recommended records:"
echo "  ${MAIL_DOMAIN}. MX 10 ${MAIL_HOST}."
echo "  ${MAIL_HOST}. A ${PUBLIC_IP:-YOUR_VPS_IP}"
echo "  ${MAIL_DOMAIN}. TXT \"${EXPECTED_SPF}\""
echo "  _dmarc.${MAIL_DOMAIN}. TXT \"${EXPECTED_DMARC}; p=quarantine; adkim=s; aspf=s; rua=mailto:postmaster@${MAIL_DOMAIN}; pct=100\""
echo "  Hetzner rDNS: ${PUBLIC_IP:-YOUR_VPS_IP} -> ${MAIL_HOST}"

exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
