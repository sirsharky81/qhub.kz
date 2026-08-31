#!/bin/bash
# Apply QUIC-mimicry I1 for Hetzner VPS blocked in Russia (AS24940 / TSPU).
# Uses SNI 7-zip.org per amneziawg-installer ADVANCED.en.md — then regen all clients.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/qhub.kz}"
AWG_CONF="/etc/amnezia/amneziawg/awg0.conf"
AWG_CFG="/root/awg/awgsetup_cfg.init"
SNI="${AWG_RUSSIA_SNI:-7-zip.org}"
GENERATOR="${APP_DIR}/scripts/vpn/generate-quic-i1.mjs"

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

if ! command -v awg >/dev/null 2>&1 || ! awg show awg0 >/dev/null 2>&1; then
  echo "[hetzner-i1] awg0 not running — skip"
  exit 0
fi

if [ ! -f "$AWG_CONF" ]; then
  echo "[hetzner-i1] missing $AWG_CONF — skip" >&2
  exit 0
fi

if [ ! -f "$GENERATOR" ]; then
  echo "[hetzner-i1] missing generator $GENERATOR" >&2
  exit 1
fi

# Optional: skip on non-Hetzner hosts unless forced.
if [ "${AWG_FORCE_HETZNER_I1:-0}" != "1" ]; then
  asn=""
  pub_ip="$(curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null || true)"
  if [ -n "$pub_ip" ]; then
    asn="$(whois -h whois.radb.net -- "-i origin AS" "$pub_ip" 2>/dev/null | grep -m1 '^origin:' | awk '{print $2}' || true)"
    [ -z "$asn" ] && asn="$(curl -fsS --max-time 5 "https://ipinfo.io/${pub_ip}/org" 2>/dev/null | grep -oE 'AS[0-9]+' | head -1 || true)"
  fi
  if [ -n "$asn" ] && [ "$asn" != "AS24940" ]; then
    echo "[hetzner-i1] host ASN ${asn} (not Hetzner AS24940) — skip (AWG_FORCE_HETZNER_I1=1 to override)"
    exit 0
  fi
  echo "[hetzner-i1] Hetzner or unknown ASN (${asn:-?}) — applying QUIC I1"
fi

current_i1="$(grep -E '^I1\s*=' "$AWG_CONF" 2>/dev/null | head -1 || true)"
if [ -n "$current_i1" ] && echo "$current_i1" | grep -qE '<b 0xc[0-9a-fA-F]'; then
  echo "[hetzner-i1] awg0.conf already has QUIC-mimicry I1 — skip rewrite"
else
  echo "[hetzner-i1] generating I1 for SNI ${SNI}"
  i1_value="$(node "$GENERATOR" "$SNI" 3)"
  if [ -z "$i1_value" ]; then
    echo "[hetzner-i1] generator returned empty I1" >&2
    exit 1
  fi

  tmp="$(mktemp)"
  if grep -qE '^I1\s*=' "$AWG_CONF"; then
    sed "s|^I1 = .*|I1 = ${i1_value}|" "$AWG_CONF" > "$tmp"
  else
    awk -v i1="$i1_value" '
      /^\[Interface\]/ { print; print "I1 = " i1; next }
      { print }
    ' "$AWG_CONF" > "$tmp"
  fi
  install -m 600 -o root -g root "$tmp" "$AWG_CONF"
  rm -f "$tmp"

  if [ -f "$AWG_CFG" ]; then
    if grep -q '^export AWG_I1=' "$AWG_CFG"; then
      sed -i "s|^export AWG_I1=.*|export AWG_I1='${i1_value}'|" "$AWG_CFG"
    else
      echo "export AWG_I1='${i1_value}'" >> "$AWG_CFG"
    fi
  fi

  echo "[hetzner-i1] restarting awg0"
  systemctl restart awg-quick@awg0 2>/dev/null || { awg-quick down awg0 2>/dev/null || true; awg-quick up awg0; }
fi

if [ -x "${APP_DIR}/scripts/vpn/amnezia-client.sh" ]; then
  echo "[hetzner-i1] regen all clients"
  bash "${APP_DIR}/scripts/vpn/amnezia-client.sh" regen-all || true
fi

grep -E '^(ListenPort|Jc|I1)' "$AWG_CONF" 2>/dev/null | head -5 || true
echo "[hetzner-i1] done — re-import QR/vpn:// from portal (AmneziaVPN app)"
