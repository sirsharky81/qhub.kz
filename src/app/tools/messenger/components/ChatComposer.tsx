"use client";

import { MAX_TEXT_LENGTH } from "@/lib/messenger/constants";
import type { DisplayMessage } from "./MessageBubble";

interface Props {
  text: string;
  onTextChange: (value: string) => void;
  onSend: () => void;
  onFile: (file: File) => void;
  canSend: boolean;
  replyTo: DisplayMessage | null;
  onCancelReply: () => void;
  onFocus?: () => void;
}

export function ChatComposer({
  text,
  onTextChange,
  onSend,
  onFile,
  canSend,
  replyTo,
  onCancelReply,
  onFocus,
}: Props) {
  const replyPreview =
    replyTo?.plain?.text ??
    (replyTo?.type === "image" ? "Фото" : replyTo?.plain?.filename ?? "Сообщение");

  return (
    <div
      className="shrink-0 border-t border-gray-200 bg-white/95 backdrop-blur"
      style={{
        paddingTop: "0.625rem",
        paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
      }}
    >
      {replyTo && (
        <div className="flex items-start gap-2 mb-2 px-1 rounded-xl bg-gray-50 border border-gray-200 py-2">
          <div className="flex-1 min-w-0 border-l-2 border-sky-500 pl-2">
            <p className="text-[11px] font-medium text-sky-700">Ответ</p>
            <p className="text-xs text-gray-600 truncate">{replyPreview}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="shrink-0 h-7 w-7 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            aria-label="Отменить цитирование"
          >
            ×
          </button>
        </div>
      )}
      {text.length > 3500 && (
        <p className="text-xs text-amber-600 px-1 mb-1.5">
          {text.length}/{MAX_TEXT_LENGTH}
        </p>
      )}
      <div className="flex items-end gap-2 min-w-0 max-w-full">
        <label
          className="mb-0.5 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Прикрепить файл"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
            />
          </svg>
          <input
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value.slice(0, MAX_TEXT_LENGTH))}
          rows={1}
          placeholder="Сообщение"
          className="min-w-0 flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-base leading-snug max-h-32 focus:outline-none focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"
          style={{ fontSize: "16px" }}
          onFocus={onFocus}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={onSend}
          aria-label="Отправить"
          className={`mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
            canSend ? "bg-sky-600 text-white hover:bg-sky-700" : "bg-gray-200 text-gray-400"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M3.4 20.4 21 12 3.4 3.6 3 11l8 1-8 1z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
