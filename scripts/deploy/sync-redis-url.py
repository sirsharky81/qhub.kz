#!/usr/bin/env python3
"""Sync REDIS_URL in .env.production with /root/.redis_password (no secret output)."""
from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import quote

ENV_PATH = Path("/var/www/qhub.kz/.env.production")
PASS_PATH = Path("/root/.redis_password")


def main() -> int:
    if not PASS_PATH.exists():
        print("error: /root/.redis_password missing", file=sys.stderr)
        return 1
    if not ENV_PATH.exists():
        print("error: .env.production missing", file=sys.stderr)
        return 1

    password = PASS_PATH.read_text(encoding="utf-8").strip()
    if not password:
        print("error: redis password file empty", file=sys.stderr)
        return 1

    encoded = quote(password, safe="")
    new_url = f"redis://:{encoded}@127.0.0.1:6379"

    raw = ENV_PATH.read_text(encoding="utf-8")
    if not re.search(r"^REDIS_URL=", raw, flags=re.MULTILINE):
        print("error: REDIS_URL not found in .env.production", file=sys.stderr)
        return 1

    updated, count = re.subn(r"^REDIS_URL=.*$", f"REDIS_URL={new_url}", raw, count=1, flags=re.MULTILINE)
    if count != 1:
        print("error: failed to update REDIS_URL", file=sys.stderr)
        return 1

    if updated == raw:
        print("ok: REDIS_URL already in sync")
        return 0

    ENV_PATH.write_text(updated, encoding="utf-8")
    print("ok: REDIS_URL synced from /root/.redis_password")
    return 0


if __name__ == "__main__":
    sys.exit(main())
