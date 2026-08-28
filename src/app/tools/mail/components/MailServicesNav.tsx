"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  fetchMailProfile,
  logoutMail,
  updateMailProfile,
  type MailProfileResult,
} from "@/lib/mail/web/client";
import { effectiveMailSignature } from "@/lib/mail/web/profile-utils";
import { iosPwaShellStyle, useIosPwaKeyboardShell } from "@/lib/platform/ios-pwa-keyboard-shell";

const SERVICES = [
  { href: "/tools/mail/inbox", label: "Почта", icon: "✉️", active: true },
  { href: "/", label: "Сервисы", icon: "▦" },
  { href: "/tools/messenger", label: "Чат", icon: "💬" },
  { href: "/share", label: "Share", icon: "📤" },
  { href: "/send", label: "Send", icon: "📨" },
] as const;

type AccountTab = "general" | "personal" | "signature";

interface Props {
  email: string;
  onAccount: () => void;
}

export function MailServicesNav({ email, onAccount }: Props) {
  return (
    <nav
      className="shrink-0 border-t border-gray-200 bg-white flex items-stretch"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      {SERVICES.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] touch-manipulation ${
            "active" in item && item.active ? "text-sky-700 font-medium" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <span className="text-base leading-none">{item.icon}</span>
          <span>{item.label}</span>
        </Link>
      ))}
      <button
        type="button"
        onClick={onAccount}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-gray-500 hover:text-gray-700 touch-manipulation"
        title={email}
      >
        <span className="text-base leading-none">👤</span>
        <span>Аккаунт</span>
      </button>
    </nav>
  );
}

interface AccountSheetProps {
  open: boolean;
  email: string;
  onClose: () => void;
  onLogout: () => void;
}

const TABS: Array<{ id: AccountTab; label: string }> = [
  { id: "general", label: "Общее" },
  { id: "personal", label: "Личные данные" },
  { id: "signature", label: "Подпись" },
];

export function MailAccountSheet({ open, email, onClose, onLogout }: AccountSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useIosPwaKeyboardShell(scrollRef, open);
  const [tab, setTab] = useState<AccountTab>("general");
  const [profile, setProfile] = useState<MailProfileResult | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
        setSaved(false);
      }
    });
    void fetchMailProfile()
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setFullName(data.fullName);
        setPhone(data.phone);
        setSignature(data.signature);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleSavePersonal() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const data = await updateMailProfile({ fullName, phone });
      setProfile(data);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSignature() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const data = await updateMailProfile({ signature });
      setProfile(data);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const previewSignature = profile
    ? effectiveMailSignature({ fullName, phone, signature })
    : "";

  return (
    <div
      className="fixed inset-0 z-[70] mx-auto flex max-w-lg flex-col overflow-hidden bg-white text-gray-900"
      style={iosPwaShellStyle}
    >
      <header
        className="shrink-0 flex items-center gap-3 border-b border-gray-200 px-4 py-3 bg-white"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button type="button" onClick={onClose} className="text-sky-600 text-sm touch-manipulation">
          Закрыть
        </button>
        <h2 className="flex-1 text-center text-sm font-semibold">Аккаунт</h2>
        <span className="w-12" />
      </header>

      <div className="shrink-0 flex border-b border-gray-200">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setError(null);
              setSaved(false);
            }}
            className={`flex-1 py-2.5 text-xs font-medium touch-manipulation ${
              tab === item.id ? "text-sky-700 border-b-2 border-sky-600" : "text-gray-500"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y px-4 py-4 space-y-4 [-webkit-overflow-scrolling:touch]"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <p className="text-sm text-gray-500 truncate">{email}</p>

        {loading && <p className="text-sm text-gray-500">Загрузка…</p>}

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {saved && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">Сохранено</p>}

        {tab === "general" && (
          <div className="space-y-3">
            <Link
              href="/tools/mail/password"
              className="block w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-center text-gray-900 hover:bg-gray-50"
              onClick={onClose}
            >
              Сменить пароль
            </Link>
            <button
              type="button"
              onClick={() => void logoutMail().then(onLogout)}
              className="w-full rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 touch-manipulation"
            >
              Выйти
            </button>
          </div>
        )}

        {tab === "personal" && !loading && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              ФИО будет отображаться у получателей как имя отправителя.
            </p>
            <label className="block space-y-1">
              <span className="text-sm text-gray-600">ФИО</span>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Иванов Иван Иванович"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                style={{ fontSize: "16px" }}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-gray-600">Телефон</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 777 000 0000"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
                style={{ fontSize: "16px" }}
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSavePersonal()}
              className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 touch-manipulation"
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        )}

        {tab === "signature" && !loading && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Подпись добавляется в конец исходящих писем. Если поле пустое, используются ФИО и телефон из личных данных.
            </p>
            <label className="block space-y-1">
              <span className="text-sm text-gray-600">Текст подписи</span>
              <textarea
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder={"С уважением,\nИван Иванов\n+7 777 000 0000"}
                rows={6}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none leading-relaxed"
                style={{ fontSize: "16px" }}
              />
            </label>
            {previewSignature && (
              <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2.5">
                <p className="text-xs text-gray-500 mb-1">Предпросмотр</p>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{previewSignature}</pre>
              </div>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveSignature()}
              className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 touch-manipulation"
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
