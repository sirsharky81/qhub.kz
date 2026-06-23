"use client";

import type { PlainMessage } from "@/lib/messenger/crypto";

export interface DisplayMessage {
  id: string;
  mine: boolean;
  ts: number;
  status?: "sent" | "failed" | "pending";
  plain?: PlainMessage;
  type: "text" | "image" | "file";
}

interface Props {
  message: DisplayMessage;
  onRetry?: (id: string) => void;
}

export function MessageBubble({ message, onRetry }: Props) {
  return (
    <div
      className={`flex w-full min-w-0 ${message.mine ? "justify-end" : "justify-start"}`}
      style={{
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
      }}
    >
      <div
        className={`min-w-0 max-w-[min(82%,18rem)] w-fit px-3 py-2 shadow-sm break-words ${
          message.mine
            ? "bg-sky-600 text-white rounded-2xl rounded-br-md"
            : "bg-white border border-gray-200 text-gray-900 rounded-2xl rounded-bl-md"
        }`}
      >
        {message.type === "text" && (
          <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {message.plain?.text}
          </p>
        )}
        {message.type === "image" && message.plain?.data && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:${message.plain.mime ?? "image/jpeg"};base64,${message.plain.data}`}
            alt=""
            className="max-w-full rounded-lg"
          />
        )}
        {message.type === "file" && (
          <a
            href={
              message.plain?.data
                ? `data:${message.plain.mime ?? "application/octet-stream"};base64,${message.plain.data}`
                : "#"
            }
            download={message.plain?.filename ?? "file"}
            className="text-sm underline break-all"
          >
            📎 {message.plain?.filename ?? "Файл"}
          </a>
        )}
        <div className={`text-[10px] mt-1 ${message.mine ? "text-sky-100" : "text-gray-400"}`}>
          {new Date(message.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          {message.status === "failed" && (
            <button type="button" onClick={() => onRetry?.(message.id)} className="ml-2 underline">
              повторить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
