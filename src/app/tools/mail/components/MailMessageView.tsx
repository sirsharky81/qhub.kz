"use client";

import Link from "next/link";
import type { MailMessage } from "@/lib/mail/web/types";
import { mailAttachmentUrl } from "@/lib/mail/web/client";

interface Props {
  message: MailMessage;
  folder: string;
  onBack: () => void;
  onReply: () => void;
  onDelete: () => void;
  onToggleRead: () => void;
  showBack?: boolean;
}

export function MailMessageView({
  message,
  folder,
  onBack,
  onReply,
  onDelete,
  onToggleRead,
  showBack = true,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-white">
        {showBack && (
          <button type="button" onClick={onBack} className="text-sky-600 text-sm touch-manipulation md:hidden">
            ← Назад
          </button>
        )}
        <div className={`flex gap-2 flex-wrap ${showBack ? "ml-auto justify-end" : "justify-start"} md:justify-end md:ml-auto`}>
          <button
            type="button"
            onClick={onToggleRead}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 touch-manipulation"
          >
            {message.unread ? "Прочитано" : "Не прочитано"}
          </button>
          <button
            type="button"
            onClick={onReply}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 touch-manipulation"
          >
            Ответить
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 touch-manipulation"
          >
            Удалить
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 leading-snug">{message.subject}</h2>
          <div className="mt-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700">
              {(message.from.replace(/.*<([^>]+)>.*/, "$1").includes("@")
                ? message.from.replace(/.*<([^>]+)>.*/, "$1")[0]
                : message.from[0] || "?"
              ).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{message.from}</p>
              <p className="text-sm text-gray-500">Кому: {message.to}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(message.date).toLocaleString("ru-RU")}
              </p>
            </div>
          </div>
        </div>
        {message.attachments.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Вложения</p>
            {message.attachments.map((att) => (
              <Link
                key={att.partId}
                href={mailAttachmentUrl(folder, message.uid, att.partId)}
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-sky-600 hover:bg-gray-50"
                download
              >
                <span>📎</span>
                <span className="truncate">{att.filename}</span>
              </Link>
            ))}
          </div>
        )}
        <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
          {message.bodyText || "(пустое сообщение)"}
        </div>
      </div>
    </div>
  );
}
