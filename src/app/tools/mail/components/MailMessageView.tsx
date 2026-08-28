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
}

export function MailMessageView({ message, folder, onBack, onReply, onDelete }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
        <button type="button" onClick={onBack} className="text-sky-400 text-sm">
          ← Назад
        </button>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onReply} className="text-sm text-sky-400">
            Ответить
          </button>
          <button type="button" onClick={onDelete} className="text-sm text-red-400">
            Удалить
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{message.subject}</h2>
          <p className="text-sm text-zinc-400 mt-2">От: {message.from}</p>
          <p className="text-sm text-zinc-500">Кому: {message.to}</p>
          <p className="text-xs text-zinc-600 mt-1">
            {new Date(message.date).toLocaleString("ru-RU")}
          </p>
        </div>
        {message.attachments.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Вложения</p>
            {message.attachments.map((att) => (
              <Link
                key={att.partId}
                href={mailAttachmentUrl(folder, message.uid, att.partId)}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-sky-400 hover:bg-zinc-900"
                download
              >
                <span>📎</span>
                <span className="truncate">{att.filename}</span>
              </Link>
            ))}
          </div>
        )}
        <div className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
          {message.bodyText || "(пустое сообщение)"}
        </div>
      </div>
    </div>
  );
}
