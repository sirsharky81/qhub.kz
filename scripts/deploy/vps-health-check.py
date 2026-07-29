#!/usr/bin/env python3
"""VPS integration health check — prints status only, no secrets."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from urllib.parse import unquote, urlparse

ENV_PATH = Path("/var/www/qhub.kz/.env.production")
REDIS_PASSWORD_FILE = Path("/root/.redis_password")


def load_env(path: Path) -> dict[str, str]:
    raw = path.read_text(encoding="utf-8")
    env: dict[str, str] = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, val = line.split("=", 1)
        val = val.strip()
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        env[key] = val.replace("\\n", "\n")
    return env


def ok(name: str, detail: str = "ok") -> dict:
    return {"name": name, "status": "ok", "detail": detail}


def fail(name: str, detail: str) -> dict:
    return {"name": name, "status": "fail", "detail": detail}


def skip(name: str, detail: str) -> dict:
    return {"name": name, "status": "skip", "detail": detail}


def http_get(url: str, headers: dict | None = None, timeout: int = 8) -> tuple[int, str]:
    req = urllib.request.Request(url, headers=headers or {}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read(4096).decode("utf-8", errors="replace")


def redis_cli_cmd(*extra: str) -> list[str] | None:
    """Prefer VPS password file; fall back to REDIS_URL from env."""
    if REDIS_PASSWORD_FILE.exists():
        password = REDIS_PASSWORD_FILE.read_text(encoding="utf-8").strip()
        if password:
            return ["redis-cli", "-h", "127.0.0.1", "-p", "6379", "-a", password, "--no-auth-warning", *extra]
    return None


def check_redis(env: dict[str, str]) -> dict:
    if not env.get("REDIS_URL", "").strip():
        return fail("Redis", "REDIS_URL missing in .env.production")

    cmd = redis_cli_cmd("PING")
    if not cmd:
        return fail("Redis", "REDIS_URL set but /root/.redis_password not found")

    try:
        ping = subprocess.run(cmd, capture_output=True, text=True, timeout=5, check=False)
        if ping.stdout.strip() != "PONG":
            detail = ping.stderr.strip() or ping.stdout.strip() or "PING failed"
            return fail("Redis", detail)

        wl = subprocess.run(
            redis_cli_cmd("STRLEN", "qhub:messenger:whitelist") or [],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        size = int(wl.stdout.strip() or "0")
        if size < 10:
            return fail("Redis whitelist", "qhub:messenger:whitelist empty")

        detail = f"PONG, whitelist={size} bytes"
        if REDIS_PASSWORD_FILE.exists():
            file_pass = REDIS_PASSWORD_FILE.read_text(encoding="utf-8").strip()
            url_pass = unquote(urlparse(env["REDIS_URL"]).password or "")
            if file_pass and url_pass != file_pass:
                detail += " (WARN: REDIS_URL password out of sync — run scripts/deploy/sync-redis-url.py)"
        return ok("Redis", detail)
    except Exception as exc:
        return fail("Redis", str(exc))


def check_turnstile(env: dict[str, str]) -> dict:
    site = env.get("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "").strip()
    secret = env.get("TURNSTILE_SECRET_KEY", "").strip()
    if not site or not secret:
        return fail("Turnstile", "site or secret missing")
    try:
        status, body = http_get("http://127.0.0.1:3000/api/captcha/turnstile-config")
        data = json.loads(body)
        enabled = bool(data.get("enabled"))
        if status != 200:
            return fail("Turnstile API", f"HTTP {status}")
        if not enabled:
            return fail("Turnstile API", "disabled in config")
        return ok("Turnstile", "keys set, API enabled")
    except Exception as exc:
        return fail("Turnstile API", str(exc))


def check_telegram(env: dict[str, str]) -> dict:
    token = env.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat = env.get("TELEGRAM_CHAT_ID", "").strip()
    if not token:
        return fail("Telegram", "TELEGRAM_BOT_TOKEN missing")
    if not chat:
        return fail("Telegram", "TELEGRAM_CHAT_ID missing")
    try:
        status, body = http_get(f"https://api.telegram.org/bot{token}/getMe")
        data = json.loads(body)
        if not data.get("ok"):
            return fail("Telegram", data.get("description", "getMe failed"))
        username = data.get("result", {}).get("username", "?")
        return ok("Telegram", f"@{username}")
    except Exception as exc:
        return fail("Telegram", str(exc))


def check_openai(env: dict[str, str]) -> dict:
    key = env.get("OPENAI_API_KEY", "").strip()
    if not key:
        return fail("OpenAI", "OPENAI_API_KEY missing")
    try:
        req = urllib.request.Request(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {key}"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status != 200:
                return fail("OpenAI", f"HTTP {resp.status}")
        return ok("OpenAI", "API key valid")
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            return fail("OpenAI", f"HTTP {exc.code} unauthorized")
        return fail("OpenAI", f"HTTP {exc.code}")
    except Exception as exc:
        return fail("OpenAI", str(exc))


def check_vapid(env: dict[str, str]) -> dict:
    pub = env.get("VAPID_PUBLIC_KEY", "").strip()
    priv = env.get("VAPID_PRIVATE_KEY", "").strip()
    if not pub or not priv:
        return fail("VAPID (web push)", "public or private key missing")
    if len(pub) < 20 or len(priv) < 20:
        return fail("VAPID (web push)", "keys too short")
    return ok("VAPID (web push)", "keys present")


def check_firebase(env: dict[str, str]) -> dict:
    pid = env.get("FIREBASE_PROJECT_ID", "").strip()
    email = env.get("FIREBASE_CLIENT_EMAIL", "").strip()
    key = env.get("FIREBASE_PRIVATE_KEY", "").strip()
    if not pid or not email or not key:
        return fail("Firebase FCM", "missing FIREBASE_* var")
    if "BEGIN PRIVATE KEY" not in key:
        return fail("Firebase FCM", "private key format invalid")
    node = r"""
const { cert, initializeApp, getApps, deleteApp } = require('firebase-admin/app');
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
try {
  if (getApps().length) getApps().forEach((a) => deleteApp(a));
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  console.log('OK');
} catch (e) {
  console.error('ERR:' + e.message);
  process.exit(1);
}
"""
    try:
        proc = subprocess.run(
            ["node", "-e", node],
            cwd="/var/www/qhub.kz",
            env={**os.environ, **env},
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if proc.returncode == 0 and "OK" in proc.stdout:
            return ok("Firebase FCM", f"project={pid}")
        err = (proc.stderr or proc.stdout).strip().replace("\n", " ")[:120]
        return fail("Firebase FCM", err or "init failed")
    except Exception as exc:
        return fail("Firebase FCM", str(exc))


def parse_turn_urls(raw: str) -> list[str]:
    urls: list[str] = []
    text = raw.strip()
    if not text:
        return urls
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            for item in parsed:
                if isinstance(item, dict) and item.get("urls"):
                    val = item["urls"]
                    if isinstance(val, list):
                        urls.extend(str(u).strip() for u in val if str(u).strip())
                    else:
                        urls.append(str(val).strip())
            return urls
    except json.JSONDecodeError:
        pass
    return [part.strip() for part in text.split(",") if part.strip()]


def coturn_service_active() -> bool:
    try:
        proc = subprocess.run(
            ["systemctl", "is-active", "coturn"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        return proc.stdout.strip() == "active"
    except Exception:
        return False


def check_turn(env: dict[str, str]) -> dict:
    urls = parse_turn_urls(env.get("MESSENGER_TURN_URLS", ""))
    username = env.get("MESSENGER_TURN_USERNAME", "").strip()
    credential = env.get("MESSENGER_TURN_CREDENTIAL", "").strip()

    if urls and username and credential:
        if not coturn_service_active():
            return fail("Coturn (static TURN)", "MESSENGER_TURN_* configured but coturn service is not active")
        return ok("Coturn (static TURN)", f"service active, {len(urls)} URL(s)")

    domain = env.get("MESSENGER_METERED_DOMAIN", "").strip()
    api_key = env.get("MESSENGER_METERED_TURN_API_KEY", "").strip()
    if domain and api_key:
        return check_metered(env)

    return skip("TURN", "no static Coturn or Metered TURN configured")


def check_metered(env: dict[str, str]) -> dict:
    domain = env.get("MESSENGER_METERED_DOMAIN", "").strip()
    api_key = env.get("MESSENGER_METERED_TURN_API_KEY", "").strip()
    region = env.get("MESSENGER_METERED_REGION", "").strip() or "global"
    if not domain or not api_key:
        return fail("Metered TURN", "domain or API key missing")
    url = (
        f"https://{domain}.metered.live/api/v1/turn/credentials?"
        + urllib.parse.urlencode({"apiKey": api_key, "region": region})
    )
    try:
        status, body = http_get(url, timeout=8)
        data = json.loads(body)
        if not isinstance(data, list) or len(data) == 0:
            return fail("Metered TURN", "empty ice servers")
        return ok("Metered TURN", f"{len(data)} ICE servers ({region})")
    except urllib.error.HTTPError as exc:
        return fail("Metered TURN", f"HTTP {exc.code}")
    except Exception as exc:
        return fail("Metered TURN", str(exc))


def check_secrets(env: dict[str, str]) -> list[dict]:
    results = []
    for name, key in [
        ("Admin session", "ADMIN_SESSION_SECRET"),
        ("Messenger session", "MESSENGER_SESSION_SECRET"),
    ]:
        val = env.get(key, "").strip()
        if len(val) < 16:
            results.append(fail(name, f"{key} missing or too short"))
        else:
            results.append(ok(name, "configured"))
    return results


def check_site() -> dict:
    try:
        status, _ = http_get("https://vps.qhub.kz/", timeout=10)
        if status != 200:
            return fail("Site HTTPS", f"HTTP {status}")
        return ok("Site HTTPS", "vps.qhub.kz")
    except Exception as exc:
        return fail("Site HTTPS", str(exc))


def check_wireguard(env: dict[str, str]) -> dict:
    if env.get("VPN_ENABLED", "").strip() not in ("1", "true", "TRUE"):
        return skip("WireGuard VPN", "VPN_ENABLED is off")

    try:
        show = subprocess.run(["wg", "show", "wg0"], capture_output=True, text=True, timeout=5, check=False)
        if show.returncode != 0:
            detail = show.stderr.strip() or "wg0 not running"
            return fail("WireGuard VPN", detail)
        peers = [line for line in show.stdout.splitlines() if line.strip().startswith("peer:")]
        listen = subprocess.run(["ss", "-ulnp"], capture_output=True, text=True, timeout=5, check=False)
        port_open = ":51820" in listen.stdout
        detail = f"{len(peers)} peer(s) on wg0"

        redis_active = None
        cmd = redis_cli_cmd("GET", "qhub:vpn:peers")
        if cmd:
            raw = subprocess.run(cmd, capture_output=True, text=True, timeout=5, check=False)
            if raw.returncode == 0 and raw.stdout.strip():
                try:
                    index = json.loads(raw.stdout.strip())
                    if isinstance(index, dict):
                        redis_active = sum(
                            1 for peer in index.values() if isinstance(peer, dict) and peer.get("status") == "active"
                        )
                except json.JSONDecodeError:
                    pass
        if redis_active is not None:
            detail += f", redis={redis_active} active"
            if redis_active != len(peers):
                return fail("WireGuard VPN", f"{detail} — run wg-sync (peers out of sync)")

        if not port_open:
            return fail("WireGuard VPN", f"{detail}; UDP 51820 not listening")
        return ok("WireGuard VPN", detail)
    except FileNotFoundError:
        return fail("WireGuard VPN", "wg command missing")
    except Exception as exc:
        return fail("WireGuard VPN", str(exc))


def check_mail(env: dict[str, str]) -> dict:
    if env.get("MAIL_ENABLED", "").strip() not in ("1", "true", "TRUE"):
        return skip("Mail", "MAIL_ENABLED is off")

    try:
        services = {
            "postfix": "postfix",
            "dovecot": "dovecot",
            "opendkim": "opendkim",
            "rspamd": "rspamd",
            "fail2ban": "fail2ban",
        }
        inactive = []
        for name, unit in services.items():
            proc = subprocess.run(
                ["systemctl", "is-active", unit],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            if proc.stdout.strip() != "active":
                inactive.append(name)
        if inactive:
            return fail("Mail", f"inactive: {', '.join(inactive)}")
        return ok("Mail", "postfix, dovecot, opendkim, rspamd, fail2ban active")
    except Exception as exc:
        return fail("Mail", str(exc))


def main() -> int:
    if not ENV_PATH.exists():
        print(json.dumps({"error": "env file missing"}, ensure_ascii=False))
        return 1
    env = load_env(ENV_PATH)
    results = [
        check_site(),
        check_redis(env),
        check_turnstile(env),
        check_telegram(env),
        check_openai(env),
        check_vapid(env),
        check_firebase(env),
        check_turn(env),
        check_wireguard(env),
        check_mail(env),
        *check_secrets(env),
    ]
    passed = sum(1 for r in results if r["status"] == "ok")
    failed = [r for r in results if r["status"] == "fail"]
    skipped = [r for r in results if r["status"] == "skip"]
    print(
        json.dumps(
            {"passed": passed, "failed": len(failed), "skipped": len(skipped), "total": len(results), "results": results},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
