#!/bin/bash
# Manage AmneziaWG clients (Russia). Requires bootstrap: amneziawg-bootstrap.sh
set -euo pipefail

MANAGE="/root/awg/manage_amneziawg.sh"
AWG_DIR="/root/awg"
APP_DIR="${APP_DIR:-/var/www/qhub.kz}"

# Client names from disk (manage list output has ANSI codes — unreliable for scripts).
list_client_names() {
  python3 - "$AWG_DIR" <<'PY'
import pathlib, re, sys
awg = pathlib.Path(sys.argv[1])
names: set[str] = set()
clients_dir = awg / "clients"
if clients_dir.is_dir():
    for d in clients_dir.iterdir():
        if d.is_dir():
            names.add(d.name)
for f in awg.glob("*.conf"):
    names.add(f.stem)
valid = re.compile(r"^[a-zA-Z0-9_-]{1,32}$")
for n in sorted(names):
    if valid.match(n):
        print(n)
PY
}

usage() {
  cat <<'EOF'
Usage:
  amnezia-client.sh add <name> [name2 ...]     Create client(s), print summary
  amnezia-client.sh add-json <name>            Create one client, JSON on stdout
  amnezia-client.sh export-json <name>         Read client files, JSON on stdout
  amnezia-client.sh remove <name>              Remove client from awg0
  amnezia-client.sh list                       List clients
  amnezia-client.sh regen <name>               Regenerate config + QR
  amnezia-client.sh regen-all                  Regenerate all clients (after server upgrade)
  amnezia-client.sh status                     Show awg0 status (text)
  amnezia-client.sh status-json                Show awg0 status (JSON)
EOF
}

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -n "$0" "$@" 2>/dev/null || exec sudo "$0" "$@"
fi

emit_client_json() {
  local name="$1"
  python3 - "$name" "$AWG_DIR" <<'PY'
import json, pathlib, re, sys
name, awg_dir = sys.argv[1], pathlib.Path(sys.argv[2])
conf_path = awg_dir / f"{name}.conf"
if not conf_path.is_file():
    alt = awg_dir / "clients" / name / f"{name}.conf"
    if alt.is_file():
        conf_path = alt
vpnuri_path = awg_dir / f"{name}.vpnuri"
if not vpnuri_path.is_file():
    alt = awg_dir / "clients" / name / f"{name}.vpnuri"
    if alt.is_file():
        vpnuri_path = alt
config = conf_path.read_text(encoding="utf-8") if conf_path.is_file() else None
vpn_uri = vpnuri_path.read_text(encoding="utf-8").strip() if vpnuri_path.is_file() else None
address = None
if config:
    m = re.search(r"^Address\s*=\s*([0-9a-fA-F.:]+)", config, re.M)
    if m:
        address = m.group(1).split("/")[0]
print(json.dumps({
    "ok": bool(config),
    "name": name,
    "config": config,
    "vpnUri": vpn_uri,
    "address": address,
}, ensure_ascii=False))
PY
}

cmd="${1:-}"
shift || true

case "$cmd" in
  add)
    [ $# -ge 1 ] || { usage; exit 1; }
    if [ ! -x "$MANAGE" ]; then
      echo "AmneziaWG not installed. Run: sudo bash scripts/deploy/amneziawg-bootstrap.sh" >&2
      exit 1
    fi
    bash "$MANAGE" add "$@" --yes >&2
    for name in "$@"; do
      echo ""
      echo "=== ${name} ==="
      emit_client_json "$name" | python3 -c "import json,sys; d=json.load(sys.stdin); print('Config:', f'{AWG_DIR}/{name}.conf'); print('vpnUri:', d.get('vpnUri') or '(missing)')"
    done
    ;;
  add-json)
    [ $# -eq 1 ] || { usage; exit 1; }
    if [ ! -x "$MANAGE" ]; then
      echo '{"ok":false,"error":"AmneziaWG not installed"}'
      exit 1
    fi
    # manage_amneziawg.sh prints colored logs to stdout — keep stdout JSON-only for Node
    if ! bash "$MANAGE" add "$1" --yes >&2; then
      echo "{\"ok\":false,\"error\":\"Не удалось добавить клиента на awg0\"}"
      exit 1
    fi
    emit_client_json "$1"
    ;;
  export-json)
    [ $# -eq 1 ] || { usage; exit 1; }
    if [ -x "$MANAGE" ]; then
      bash "$MANAGE" regen "$1" --yes >&2 || true
    fi
    emit_client_json "$1"
    ;;
  remove)
    [ $# -eq 1 ] || { usage; exit 1; }
    if [ ! -x "$MANAGE" ]; then
      echo '{"ok":false,"error":"AmneziaWG not installed"}'
      exit 1
    fi
    bash "$MANAGE" remove "$1" --yes
    rm -f "${AWG_DIR}/$1.conf" "${AWG_DIR}/$1.png" "${AWG_DIR}/$1.vpnuri" \
      "${AWG_DIR}/$1.vpnuri.png" "${AWG_DIR}/$1.vpnuri.txt" 2>/dev/null || true
    echo '{"ok":true}'
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
  regen-all)
    if [ ! -x "$MANAGE" ]; then
      echo "AmneziaWG not installed" >&2
      exit 1
    fi
    mapfile -t names < <(list_client_names)
    for name in "${names[@]}"; do
      [ -z "$name" ] && continue
      echo "[regen-all] $name" >&2
      bash "$MANAGE" regen "$name" --yes >&2 || echo "[regen-all] warn: $name" >&2
    done
    echo "[regen-all] done (${#names[@]} clients)"
    ;;
  status)
    if awg show awg0 2>/dev/null; then
      awg show awg0 | awk '/listening port:/ {print "listening port:", $3}'
    else
      echo "awg0 not running"
      exit 1
    fi
    ;;
  status-json)
    python3 - <<'PY'
import json, subprocess, re
try:
    out = subprocess.check_output(["awg", "show", "awg0"], text=True, stderr=subprocess.DEVNULL)
    port_m = re.search(r"listening port:\s*(\d+)", out)
    peers = len(re.findall(r"^peer:", out, re.M))
    print(json.dumps({
        "ok": True,
        "running": True,
        "listenPort": int(port_m.group(1)) if port_m else None,
        "peerCount": peers,
    }))
except (subprocess.CalledProcessError, FileNotFoundError):
    print(json.dumps({"ok": True, "running": False, "listenPort": None, "peerCount": 0}))
PY
    ;;
  *)
    usage
    exit 1
    ;;
esac
