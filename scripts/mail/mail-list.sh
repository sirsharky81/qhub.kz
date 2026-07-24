#!/bin/bash
# List mailboxes as JSON.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

python3 - <<'PY'
import json
import os
from pathlib import Path

domain = os.environ.get("MAIL_DOMAIN", "qhub.kz")
users_file = Path(os.environ.get("DOVECOT_USERS", "/etc/dovecot/users"))
entries = []

if users_file.exists():
    for line in users_file.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(":")
        if len(parts) < 6:
            continue
        email = parts[0]
        if not email.endswith("@" + domain):
            continue
        entries.append({
            "email": email,
            "maildir": parts[5] or None,
        })

entries.sort(key=lambda item: item["email"])
print(json.dumps(entries, ensure_ascii=False))
PY
