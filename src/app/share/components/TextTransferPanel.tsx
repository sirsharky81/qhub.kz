"use client";

import { useState } from "react";
import type { ShareTextMessage } from "@/lib/share/transfer-manager";

interface Props {
  messages: ShareTextMessage[];
  draft: string;
  canSend: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}

function MessageBody({ message }: { message: ShareTextMessage }) {
  if (message.kind === "link") {
    const url = message.body.trim();
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sky-700 underline break-all"
      >
        {url}
      </a>
    );
  }

  return <p className="whitespace-pre-wrap break-words text-sm text-gray-800">{message.body}</p>;
}

export function TextTransferPanel({ messages, draft, canSend, onDraftChange, onSend }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyMessage(message: ShareTextMessage) {
    try {
      await navigator.clipboard.writeText(message.body);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="px-4 pb-4 space-y-3">
      <div className="rounded-xl border border-gray-200 p-3 space-y-3">
        <p className="text-xs font-medium text-gray-500">Текст и ссылки</p>

        {messages.length > 0 && (
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  message.direction === "out" ? "bg-sky-50 ml-6" : "bg-gray-50 mr-6"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
                      {message.direction === "out" ? "Вы" : "Собеседник"}
                      {message.kind === "link" ? " · ссылка" : ""}
                    </p>
                    <MessageBody message={message} />
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyMessage(message)}
                    className="shrink-0 text-[11px] text-gray-500 hover:text-gray-800"
                  >
                    {copiedId === message.id ? "✓" : "Копировать"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Текст или ссылка для отправки"
          rows={3}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm resize-none"
          disabled={!canSend}
        />

        <button
          type="button"
          disabled={!canSend || !draft.trim()}
          onClick={onSend}
          className="w-full rounded-xl border border-sky-600 text-sky-700 py-2 text-sm font-semibold disabled:opacity-40"
        >
          Отправить текст
        </button>
      </div>
    </div>
  );
}
