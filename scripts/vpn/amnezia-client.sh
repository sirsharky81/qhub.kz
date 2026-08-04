#!/bin/bash
# Manage AmneziaWG clients (Russia). Requires bootstrap: amneziawg-bootstrap.sh
set -euo pipefail

MANAGE="/root/awg/manage_amneziawg.sh"
CLIENTS_DIR="/root/awg/clients"

usage() {
  cat <<'EOF'
Usage:
  amnezia-client.sh add <name> [name2 ...]   Create client(s), print vpn:// links
  amnezia-client.sh list                     List clients
  amnezia-client.sh regen <name>             Regenerate config + QR
  amnezia-client.sh status                   Show awg0 status
EOF
}

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

cmd="${1:-}"
shift || true

case "$cmd" in
  add)
    [ $# -ge 1 ] || { usage; exit 1; }
    if [ ! -x "$MANAGE" ]; then
      echo "AmneziaWG not installed. Run: sudo bash scripts/deploy/amneziawg-bootstrap.sh" >&2
      exit 1
    fi
    bash "$MANAGE" add "$@" --yes
    for name in "$@"; do
      dir="${CLIENTS_DIR}/${name}"
      echo ""
      echo "=== ${name} ==="
      if [ -f "${dir}/${name}.conf" ]; then
        echo "Config: ${dir}/${name}.conf"
      fi
      if [ -f "${dir}/${name}.vpnuri.png" ]; then
        echo "QR (Amnezia): ${dir}/${name}.vpnuri.png"
      elif [ -f "${dir}/${name}.png" ]; then
        echo "QR: ${dir}/${name}.png"
      fi
      if [ -f "${dir}/${name}.vpnuri.txt" ]; then
        echo "vpn:// link:"
        cat "${dir}/${name}.vpnuri.txt"
      fi
    done
    ;;
  list)
    if [ -x "$MANAGE" ]; then
      bash "$MANAGE" list
    else
      echo "AmneziaWG not installed"
      exit 1
    fi
    ;;
  regen)
    [ $# -ge 1 ] || { usage; exit 1; }
    bash "$MANAGE" regen "$@"
    ;;
  status)
    if awg show awg0 2>/dev/null; then
      awg show awg0 | awk '/listening port:/ {print "listening port:", $3}'
    else
      echo "awg0 not running"
      exit 1
    fi
    ;;
  *)
    usage
    exit 1
    ;;
esac
