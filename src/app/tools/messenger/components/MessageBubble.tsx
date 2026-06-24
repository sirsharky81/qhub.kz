"use client";

import type { PlainMessage } from "@/lib/messenger/crypto";
import type { DeliveryStatus } from "@/lib/messenger/types";

export interface DisplayMessage {
  id: string;
  mine: boolean;
  ts: number;
  status?: DeliveryStatus;
  plain?: PlainMessage;
  type: "text" | "image" | "file";
  fromPhone?: string;
}

interface Props {
  message: DisplayMessage;
  onRetry?: (id: string) => void;
  onReply?: (message: DisplayMessage) => void;
  onQuoteClick?: (messageId: string) => void;
  showSender?: boolean;
  senderLabel?: string;
  senderColor?: string;
  quoteAvailable?: boolean;
}

function DeliveryTicks({ status, mine }: { status?: DeliveryStatus; mine: boolean }) {
  if (!mine || !status || status === "pending" || status === "failed") return null;
  const isRead = status === "read";
  const isDelivered = status === "delivered" || isRead;
  const color = isRead ? "text-sky-200" : "text-sky-100/80";
  return (
    <span className={`inline-flex items-center ml-1 ${color}`} aria-label={status}>
      <svg viewBox="0 0 16 11" className="h-3 w-3" fill="currentColor">
        <path d="M1 5.5L4.5 9 9 2" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
      {isDelivered && (
        <svg viewBox="0 0 16 11" className="h-3 w-3 -ml-1.5" fill="currentColor">
          <path d="M1 5.5L4.5 9 9 2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      )}
    </span>
  );
}

export function MessageBubble({
  message,
  onRetry,
  onReply,
  onQuoteClick,
  showSender,
  senderLabel,
  senderColor,
  quoteAvailable = true,
}: Props) {
  const quoted = message.plain?.quotedMessageId
    ? {
        id: message.plain.quotedMessageId,
        author: message.plain.quotedAuthor ?? "Сообщение",
        text: message.plain.quotedText ?? "",
      }
    : null;

  return (
    <div
      className={`flex w-full min-w-0 ${message.mine ? "justify-end" : "justify-start"}`}
      style={{
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
      }}
      data-message-id={message.id}
    >
      <div className={`min-w-0 max-w-[min(82%,18rem)] w-fit ${message.mine ? "items-end" : "items-start"} flex flex-col`}>
        {showSender && senderLabel && (
          <p className={`text-[11px] font-medium mb-0.5 px-1 ${senderColor ?? "text-gray-500"}`}>
            {senderLabel}
          </p>
        )}
        <div
          className={`relative group px-3 py-2 shadow-sm break-words ${
            message.mine
              ? "bg-sky-600 text-white rounded-2xl rounded-br-md"
              : "bg-white border border-gray-200 text-gray-900 rounded-2xl rounded-bl-md"
          }`}
          onContextMenu={(e) => {
            if (onReply) {
              e.preventDefault();
              onReply(message);
            }
          }}
        >
          {onReply && (
            <button
              type="button"
              onClick={() => onReply(message)}
              className={`absolute -left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1.5 py-0.5 rounded-full ${
                message.mine ? "bg-sky-700 text-white" : "bg-gray-100 text-gray-600"
              }`}
              aria-label="Ответить"
            >
              ↩
            </button>
          )}
          {quoted && (
            <button
              type="button"
              onClick={() => onQuoteClick?.(quoted.id)}
              className={`mb-1.5 w-full text-left rounded-lg border-l-2 pl-2 py-1 text-xs ${
                message.mine
                  ? "border-sky-200/80 bg-sky-500/30 text-sky-50"
                  : "border-sky-400 bg-sky-50/80 text-gray-600"
              }`}
            >
              <span className="font-medium block">{quoted.author}</span>
              <span className="line-clamp-2">
                {quoteAvailable ? quoted.text || "Вложение" : "Сообщение недоступно"}
              </span>
            </button>
          )}
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
          <div
            className={`text-[10px] mt-1 flex items-center justify-end gap-0.5 ${
              message.mine ? "text-sky-100" : "text-gray-400"
            }`}
          >
            <span>
              {new Date(message.ts).toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <DeliveryTicks status={message.status} mine={message.mine} />
            {message.status === "failed" && (
              <button type="button" onClick={() => onRetry?.(message.id)} className="ml-2 underline">
                повторить
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
