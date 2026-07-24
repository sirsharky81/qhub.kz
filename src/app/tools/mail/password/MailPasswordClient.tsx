"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface MailSettings {
  enabled: boolean;
  domain: string;
  host: string;
  imap: { host: string; port: number; security: string };
  smtp: { host: string; port: number; security: string };
}

export function MailPasswordClient() {
  const [settings, setSettings] = useState<MailSettings | null>(null);
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetch("/api/mail/settings")
      .then((res) => res.json())
      .then((data: MailSettings) => setSettings(data))
      .catch(() => setSettings(null));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/mail/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, currentPassword, newPassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Ошибка");
        return;
      }
      setMessage("Пароль изменён");
      setCurrentPassword("");
      setNewPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-md mx-auto space-y-6">
        <div>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
            ← На главную
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Смена пароля почты</h1>
          <p className="text-sm text-gray-500 mt-2">
            Для ящиков <span className="font-mono">@{settings?.domain ?? "qhub.kz"}</span>.
          </p>
        </div>

        {!settings ? (
          <p className="text-sm text-gray-500">Загрузка…</p>
        ) : !settings.enabled ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            Почтовый сервер ещё не настроен на VPS.
          </p>
        ) : (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700 space-y-1">
              <p>
                IMAP: <span className="font-mono">{settings.imap.host}:{settings.imap.port}</span> (
                {settings.imap.security})
              </p>
              <p>
                SMTP: <span className="font-mono">{settings.smtp.host}:{settings.smtp.port}</span> (
                {settings.smtp.security})
              </p>
            </div>

            <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
              <input
                type="email"
                placeholder={`you@${settings.domain}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm"
                autoComplete="username"
                required
              />
              <input
                type="password"
                placeholder="Текущий пароль"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm"
                autoComplete="current-password"
                required
              />
              <input
                type="password"
                placeholder="Новый пароль (мин. 8 символов)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gray-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {loading ? "Сохранение…" : "Сменить пароль"}
              </button>
              {message && <p className="text-sm text-gray-600">{message}</p>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
