"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
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
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 text-gray-500 text-sm">
        Загрузка…
      </div>
    );
  }

  const domain = settings?.domain ?? "qhub.kz";

  return (
    <MailShell title="Почта QHub" leading={<MailBackLink href="/" />} scrollMain>
      <div className="px-4 py-6 max-w-md mx-auto w-full space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Вход в почту</h2>
          <p className="text-sm text-gray-500 mt-2">
            Введите логин и пароль ящика <span className="font-mono">@{domain}</span>
          </p>
        </div>

        {!settings ? (
          <p className="text-sm text-gray-500">Загрузка…</p>
        ) : !settings.enabled ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            Почтовый сервер ещё не настроен на VPS.
          </p>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <input
              type="email"
              placeholder={`you@${domain}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400"
              style={{ fontSize: "16px" }}
              autoComplete="username"
              required
            />
            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400"
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
              className="w-full rounded-xl bg-gray-900 text-white py-3 text-sm font-semibold disabled:opacity-50"
            >
              {loading ? "Вход…" : "Войти"}
            </button>
          </form>
        )}

        {error && (
          <p className="text-sm text-red-600 text-center bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <p className="text-center text-xs text-gray-500 pb-4">
          <Link href="/tools/mail/password" className="text-sky-600 hover:underline">
            Сменить пароль
          </Link>
        </p>
      </div>
    </MailShell>
  );
}
