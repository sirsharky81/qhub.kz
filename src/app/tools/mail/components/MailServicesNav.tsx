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
      className="shrink-0 border-t border-zinc-800 bg-black flex items-stretch"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      {SERVICES.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] ${
            "active" in item && item.active ? "text-sky-400" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <span className="text-base leading-none">{item.icon}</span>
          <span>{item.label}</span>
        </Link>
      ))}
      <button
        type="button"
        onClick={onAccount}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-zinc-500 hover:text-zinc-300"
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
      <button type="button" className="fixed inset-0 z-50 bg-black/60" aria-label="Закрыть" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[51] rounded-t-2xl border-t border-zinc-700 bg-zinc-900 p-4 space-y-3"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <p className="text-sm text-zinc-400 truncate">{email}</p>
        <Link
          href="/tools/mail/password"
          className="block w-full rounded-xl border border-zinc-700 px-4 py-3 text-sm text-center hover:bg-zinc-800"
          onClick={onClose}
        >
          Сменить пароль
        </Link>
        <button
          type="button"
          onClick={() => void logoutMail().then(onLogout)}
          className="w-full rounded-xl bg-red-950/50 border border-red-900 px-4 py-3 text-sm text-red-400"
        >
          Выйти
        </button>
      </div>
    </>
  );
}
