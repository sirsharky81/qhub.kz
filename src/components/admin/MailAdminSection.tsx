"use client";

import { useCallback, useEffect, useState } from "react";

interface MailStatus {
  configured: boolean;
  enabled: boolean;
  domain: string;
  host: string;
  addCommandSet: boolean;
  listCommandSet: boolean;
  passwdCommandSet: boolean;
  removeCommandSet: boolean;
  mailboxes?: MailMailbox[];
  error?: string;
}

interface MailMailbox {
  email: string;
  maildir: string | null;
}

export function MailAdminSection() {
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/mail/mailboxes");
      if (!res.ok) throw new Error("load failed");
      setStatus((await res.json()) as MailStatus);
    } catch {
      setError("Не удалось загрузить почту");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/mail/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string; mailboxes?: MailMailbox[] };
      if (!res.ok) {
        setMessage(data.error ?? "Ошибка");
        return;
      }
      setStatus((prev) => (prev ? { ...prev, mailboxes: data.mailboxes ?? [] } : prev));
      setMessage(`Ящик создан: ${email}`);
      setEmail("");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(target: string) {
    if (!window.confirm(`Удалить ящик ${target}?`)) return;
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/mail/mailboxes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const data = (await res.json()) as { error?: string; mailboxes?: MailMailbox[] };
      if (!res.ok) {
        setMessage(data.error ?? "Ошибка");
        return;
      }
      setStatus((prev) => (prev ? { ...prev, mailboxes: data.mailboxes ?? [] } : prev));
      setMessage(`Ящик удалён: ${target}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(target: string) {
    const newPassword = window.prompt(`Новый пароль для ${target} (мин. 8 символов):`);
    if (newPassword === null) return;
    if (newPassword.length < 8) {
      setMessage("Пароль не короче 8 символов");
      return;
    }
    if (!window.confirm(`Сбросить пароль для ${target}?`)) return;

    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/mail/mailboxes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target, password: newPassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Ошибка");
        return;
      }
      setMessage(`Пароль сброшен: ${target}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="text-xs font-mono uppercase tracking-wider text-gray-500">Почта @qhub.kz</h2>
        <p className="text-xs text-gray-400 mt-1">
          Создавайте ящики для семьи и доверенных пользователей. Смена пароля — на{" "}
          <span className="font-mono">/tools/mail/password</span>.
        </p>
      </div>
      <div className="p-4 space-y-4 text-sm text-gray-700">
        {error && <p className="text-red-700">{error}</p>}
        {!status ? (
          <p className="text-gray-500">Загрузка…</p>
        ) : (
          <>
            <p>
              Сервер:{" "}
              <span className={status.configured ? "text-emerald-700" : "text-amber-700"}>
                {status.configured ? "готов" : "не настроен (см. docs/mail.md)"}
              </span>
            </p>
            {status.host && (
              <p>
                IMAP/SMTP: <span className="font-mono text-xs">{status.host}</span>
              </p>
            )}
            <form onSubmit={handleCreate} className="grid gap-2 max-w-md">
              <input
                type="email"
                placeholder={`user@${status.domain}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm"
                required
              />
              <input
                type="text"
                placeholder="Начальный пароль (мин. 8 символов)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm"
                minLength={8}
                required
              />
              <button
                type="submit"
                disabled={busy || !status.configured}
                className="rounded-xl bg-gray-900 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Сохранение…" : "Создать ящик"}
              </button>
            </form>
            {status.mailboxes && status.mailboxes.length > 0 && (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                {status.mailboxes.map((box) => (
                  <li key={box.email} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="font-mono text-xs">{box.email}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        disabled={busy || !status.passwdCommandSet}
                        onClick={() => void handleResetPassword(box.email)}
                        className="text-xs text-gray-700 hover:underline disabled:opacity-50"
                      >
                        Сбросить пароль
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleRemove(box.email)}
                        className="text-xs text-red-700 hover:underline disabled:opacity-50"
                      >
                        Удалить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {status.error && <p className="text-xs text-amber-700">{status.error}</p>}
            {message && <p className="text-xs text-gray-600">{message}</p>}
          </>
        )}
      </div>
    </section>
  );
}
