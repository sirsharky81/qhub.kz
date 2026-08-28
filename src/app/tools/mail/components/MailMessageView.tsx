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
}

export function MailMessageView({
  message,
  folder,
  onBack,
  onReply,
  onDelete,
  onToggleRead,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white">
        <button type="button" onClick={onBack} className="text-sky-600 text-sm touch-manipulation">
          ← Назад
        </button>
        <div className="ml-auto flex gap-2 flex-wrap justify-end">
          <button type="button" onClick={onToggleRead} className="text-sm text-gray-500 touch-manipulation">
            {message.unread ? "Прочитано" : "Не прочитано"}
          </button>
          <button type="button" onClick={onReply} className="text-sm text-sky-600 touch-manipulation">
            Ответить
          </button>
          <button type="button" onClick={onDelete} className="text-sm text-red-600 touch-manipulation">
            Удалить
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{message.subject}</h2>
          <p className="text-sm text-gray-600 mt-2">От: {message.from}</p>
          <p className="text-sm text-gray-500">Кому: {message.to}</p>
          <p className="text-xs text-gray-400 mt-1">
            {new Date(message.date).toLocaleString("ru-RU")}
          </p>
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
