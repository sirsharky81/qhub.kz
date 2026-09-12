#!/usr/bin/env python3
"""Idempotently upsert KGD tax-debt keys in .env.production. Reads KEY=value from stdin."""
from pathlib import Path
import sys

ENV_FILE = Path(sys.argv[1] if len(sys.argv) > 1 else "/var/www/qhub.kz/.env.production")
ALLOWED = {
    "KGD_API_BASE_URL",
    "KGD_PORTAL_TOKEN",
    "KGD_PERSONAL_ACCOUNT_TOKEN",
}

incoming: dict[str, str] = {}
for raw in sys.stdin:
    line = raw.strip()
    if not line or "=" not in line or line.startswith("#"):
        continue
    key, value = line.split("=", 1)
    if key in ALLOWED and value.strip():
        incoming[key] = value.strip()

if "KGD_PORTAL_TOKEN" not in incoming or "KGD_PERSONAL_ACCOUNT_TOKEN" not in incoming:
    print("[kgd-env] missing required tokens on stdin", file=sys.stderr)
    sys.exit(1)

incoming.setdefault("KGD_API_BASE_URL", "https://portal.kgd.gov.kz")

if not ENV_FILE.exists():
    print(f"[kgd-env] missing {ENV_FILE}", file=sys.stderr)
    sys.exit(1)

lines = ENV_FILE.read_text(encoding="utf-8", errors="replace").splitlines()
kept = [line for line in lines if not line.startswith(tuple(f"{key}=" for key in ALLOWED | {"KGD_PUBLIC_KEY", "KGD_PRIVATE_KEY"}))]
while kept and kept[-1] == "":
    kept.pop()
kept.append("")
kept.extend(f"{key}={incoming[key]}" for key in ("KGD_API_BASE_URL", "KGD_PORTAL_TOKEN", "KGD_PERSONAL_ACCOUNT_TOKEN"))
kept.append("")
ENV_FILE.write_text("\n".join(kept) + "\n", encoding="utf-8")
ENV_FILE.chmod(0o600)
print("[kgd-env] updated KGD keys in .env.production")
