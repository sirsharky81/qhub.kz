"use client";

import type { MailListItem } from "@/lib/mail/web/types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function avatarColor(name: string): string {
  const colors = ["bg-emerald-600", "bg-sky-600", "bg-violet-600", "bg-rose-600", "bg-amber-600"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % colors.length;
  return colors[hash];
}

interface Props {
  items: MailListItem[];
  onSelect: (uid: number) => void;
}

export function MailList({ items, onSelect }: Props) {
  if (!items.length) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-500 px-4 text-center">
        Нет писем
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto divide-y divide-zinc-900">
      {items.map((item) => (
        <li key={item.uid}>
          <button
            type="button"
            onClick={() => onSelect(item.uid)}
            className="w-full flex gap-3 px-3 py-3 text-left hover:bg-zinc-900/80"
          >
            <div
              className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold text-white ${avatarColor(item.fromName)}`}
            >
              {(item.fromName[0] || "?").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {item.unread && <span className="h-2 w-2 rounded-full bg-sky-500 shrink-0" />}
                <span className={`truncate text-sm ${item.unread ? "font-semibold" : "font-medium text-zinc-300"}`}>
                  {item.fromName || item.from}
                </span>
                <span className="ml-auto text-xs text-zinc-500 shrink-0 flex items-center gap-1">
                  {item.hasAttachments && <span aria-hidden>📎</span>}
                  {formatDate(item.date)}
                </span>
              </div>
              <p className={`truncate text-sm mt-0.5 ${item.unread ? "text-white" : "text-zinc-400"}`}>
                {item.subject}
              </p>
              {item.preview && (
                <p className="truncate text-xs text-zinc-500 mt-0.5">{item.preview}</p>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
