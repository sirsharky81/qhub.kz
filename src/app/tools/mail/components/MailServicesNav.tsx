"use client";

import Link from "next/link";
import { logoutMail } from "@/lib/mail/web/client";

const SERVICES = [
  { href: "/tools/mail/inbox", label: "Почта", icon: "✉️", active: true },
  { href: "/", label: "Сервисы", icon: "▦" },
  { href: "/tools/messenger", label: "Чат", icon: "💬" },
  { href: "/share", label: "Share", icon: "📤" },
  { href: "/send", label: "Send", icon: "📨" },
] as const;

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

export function MailAccountSheet({ open, email, onClose, onLogout }: AccountSheetProps) {
  if (!open) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-50 bg-black/30" aria-label="Закрыть" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[51] mx-auto max-w-lg rounded-t-2xl border-t border-gray-200 bg-white p-4 space-y-3 shadow-xl"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <p className="text-sm text-gray-500 truncate">{email}</p>
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
          className="w-full rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          Выйти
        </button>
      </div>
    </>
  );
}
