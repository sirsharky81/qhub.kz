"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { MailFolder } from "@/lib/mail/web/types";

const SERVICES = [
  { href: "/", label: "Сервисы", icon: "▦" },
  { href: "/tools/messenger", label: "Чат", icon: "💬" },
  { href: "/share", label: "Share", icon: "📤" },
  { href: "/send", label: "Send", icon: "📨" },
] as const;

interface Props {
  email: string;
  folders: MailFolder[];
  activeFolder: string;
  onSelect: (path: string) => void;
  onCompose: () => void;
  onAccount: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function MailFolderSidebar({
  email,
  folders,
  activeFolder,
  onSelect,
  onCompose,
  onAccount,
  className = "",
  style,
}: Props) {
  return (
    <aside className={`flex flex-col bg-slate-50/90 ${className}`} style={style}>
      <div className="shrink-0 border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            ✉️
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">QHub Почта</p>
            <p className="truncate text-xs text-gray-500">{email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCompose}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
        >
          ✏️ Написать
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {folders.map((folder) => {
          const active = folder.path === activeFolder;
          return (
            <button
              key={folder.path}
              type="button"
              onClick={() => onSelect(folder.path)}
              className={`mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                active
                  ? "bg-sky-100 font-medium text-sky-800"
                  : "text-gray-700 hover:bg-white/80"
              }`}
            >
              <span className="flex-1 truncate">{folder.label}</span>
              {folder.unread > 0 && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    active ? "bg-sky-600 text-white" : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {folder.unread > 99 ? "99+" : folder.unread}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-gray-200 px-2 py-3">
        <div className="grid grid-cols-2 gap-1">
          {SERVICES.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-gray-600 transition hover:bg-white hover:text-gray-900"
            >
              <span aria-hidden>{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </div>
        <button
          type="button"
          onClick={onAccount}
          className="mt-2 flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-gray-600 transition hover:bg-white hover:text-gray-900"
        >
          <span aria-hidden className="shrink-0">
            👤
          </span>
          <span className="min-w-0 flex-1 truncate">Аккаунт</span>
        </button>
      </div>
    </aside>
  );
}
