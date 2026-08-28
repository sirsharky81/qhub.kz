"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { CAPTCHA_REQUIRED_MSG } from "@/lib/captcha/turnstile-client";
import { useTurnstileConfig } from "@/lib/captcha/useTurnstileConfig";
import { fetchMailSession, loginMail } from "@/lib/mail/web/client";
import { MailBackLink, MailShell } from "../components/MailShell";

interface MailSettings {
  enabled: boolean;
  domain: string;
}

export function MailLoginClient() {
  const router = useRouter();
  const turnstile = useTurnstileConfig();
  const captchaRequired = turnstile.enabled;
  const [settings, setSettings] = useState<MailSettings | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    void fetch("/api/mail/settings")
      .then((res) => res.json())
      .then((data: MailSettings) => setSettings(data))
      .catch(() => setSettings(null));

    void fetchMailSession().then((session) => {
      if (session.loggedIn) {
        router.replace("/tools/mail/inbox");
        return;
      }
      setCheckingSession(false);
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (captchaRequired && !captchaToken) {
      setError(CAPTCHA_REQUIRED_MSG);
      return;
    }
    setLoading(true);
    try {
      const res = await loginMail(email, password, captchaToken ?? undefined);
      if (!res.ok) {
        setError(res.error ?? "Ошибка входа");
        setCaptchaToken(null);
        setCaptchaReset((k) => k + 1);
        return;
      }
      router.replace("/tools/mail/inbox");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="dark min-h-[100dvh] flex items-center justify-center bg-black text-zinc-400 text-sm">
        Загрузка…
      </div>
    );
  }

  const domain = settings?.domain ?? "qhub.kz";

  return (
    <MailShell title="Почта QHub" leading={<MailBackLink href="/" />}>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6">
        <div className="w-full max-w-md mx-auto space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Вход в почту</h2>
            <p className="text-sm text-zinc-400 mt-2">
              Введите логин и пароль ящика <span className="font-mono">@{domain}</span>
            </p>
          </div>

          {!settings ? (
            <p className="text-sm text-zinc-500">Загрузка…</p>
          ) : !settings.enabled ? (
            <p className="text-sm text-amber-400 bg-amber-950/40 border border-amber-900 rounded-xl px-4 py-3">
              Почтовый сервер ещё не настроен на VPS.
            </p>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <input
                type="email"
                placeholder={`you@${domain}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-white placeholder:text-zinc-500"
                style={{ fontSize: "16px" }}
                autoComplete="username"
                required
              />
              <input
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base text-white placeholder:text-zinc-500"
                style={{ fontSize: "16px" }}
                autoComplete="current-password"
                required
              />
              <TurnstileWidget
                siteKey={turnstile.siteKey}
                enabled={captchaRequired}
                loading={turnstile.loading}
                resetKey={captchaReset}
                onToken={setCaptchaToken}
                onExpire={() => setCaptchaToken(null)}
                onError={() => setCaptchaToken(null)}
              />
              <button
                type="submit"
                disabled={
                  loading ||
                  turnstile.loading ||
                  !email.trim() ||
                  !password ||
                  (captchaRequired && !captchaToken)
                }
                className="w-full rounded-xl bg-sky-600 text-white py-3 text-sm font-semibold disabled:opacity-50"
              >
                {loading ? "Вход…" : "Войти"}
              </button>
            </form>
          )}

          {error && (
            <p className="text-sm text-red-400 text-center bg-red-950/40 border border-red-900 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <p className="text-center text-xs text-zinc-500">
            <Link href="/tools/mail/password" className="text-sky-400 hover:underline">
              Сменить пароль
            </Link>
          </p>
        </div>
      </div>
    </MailShell>
  );
}
