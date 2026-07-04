"use client";

import { useCallback, useRef } from "react";
import type { PlainMessage } from "@/lib/messenger/crypto";
import type { DeliveryStatus } from "@/lib/messenger/types";
import { useSwipeToReply } from "@/lib/messenger/use-swipe-to-reply";
import { AudioMessagePlayer } from "./AudioMessagePlayer";
import { VideoMessagePlayer } from "./VideoMessagePlayer";

export interface DisplayMessage {
  id: string;
  mine: boolean;
  ts: number;
  status?: DeliveryStatus;
  plain?: PlainMessage;
  type: "text" | "image" | "file" | "audio" | "video";
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
  /** Touch / PWA: swipe right to reply instead of tap button */
  swipeToReply?: boolean;
}

function DeliveryTicks({ status, mine }: { status?: DeliveryStatus; mine: boolean }) {
  if (!mine || !status || status === "pending" || status === "queued" || status === "failed") return null;
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
  swipeToReply = false,
}: Props) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const handleReply = useCallback(() => {
    onReply?.(message);
  }, [message, onReply]);

  const swipe = useSwipeToReply(
    bubbleRef,
    onReply ? handleReply : undefined,
    swipeToReply && Boolean(onReply),
  );

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
      <div
        className={`min-w-0 max-w-[85%] shrink flex flex-col ${
          message.mine ? "items-end" : "items-start"
        }`}
      >
        {showSender && senderLabel && (
          <p className={`text-[11px] font-medium mb-0.5 px-1 ${senderColor ?? "text-gray-500"}`}>
            {senderLabel}
          </p>
        )}
        <div className="relative flex items-center min-w-0 w-full max-w-full">
          {swipeToReply && onReply && (
            <div
              className="pointer-events-none absolute left-0 flex h-9 w-9 items-center justify-center rounded-full bg-gray-200/90 text-gray-600 shadow-sm"
              style={{ opacity: swipe.progress, transform: `scale(${0.85 + swipe.progress * 0.15})` }}
              aria-hidden
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 14L4 9l5-5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20 20v-7a4 4 0 0 0-4-4H4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
          <div
            ref={bubbleRef}
            style={swipeToReply ? swipe.style : undefined}
            className={`relative group min-w-0 w-full max-w-full overflow-hidden px-3 py-2 shadow-sm touch-pan-y ${
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
            {onReply && !swipeToReply && (
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
                className={`mb-1.5 w-full text-left rounded-md border-l-[3px] pl-2.5 pr-1 py-1.5 text-xs ${
                  message.mine
                    ? "border-white/90 bg-black/25 text-white/95"
                    : "border-sky-500 bg-gray-100 text-gray-700"
                }`}
              >
                <span
                  className={`font-semibold block truncate ${
                    message.mine ? "text-white" : "text-sky-600"
                  }`}
                >
                  {quoted.author}
                </span>
                <span
                  className={`line-clamp-2 break-all [overflow-wrap:anywhere] ${
                    message.mine ? "text-white/85" : "text-gray-600"
                  }`}
                >
                  {quoteAvailable ? quoted.text || "Вложение" : "Сообщение недоступно"}
                </span>
              </button>
            )}
          {message.type === "text" && (
            <p className="text-sm whitespace-pre-wrap break-all [overflow-wrap:anywhere] max-w-full">
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
          {message.type === "audio" && message.plain?.data && (
            <AudioMessagePlayer
              src={`data:${message.plain.mime ?? "audio/webm"};base64,${message.plain.data}`}
              mime={message.plain.mime}
              durationMs={message.plain.durationMs}
              waveformPeaks={message.plain.waveformPeaks}
              mine={message.mine}
              downloadBase64={message.plain.data}
              downloadFilename={message.plain.filename ?? "voice.webm"}
            />
          )}
          {message.type === "video" && message.plain?.data && (
            <VideoMessagePlayer
              src={`data:${message.plain.mime ?? "video/webm"};base64,${message.plain.data}`}
              mime={message.plain.mime}
              mine={message.mine}
              downloadBase64={message.plain.data}
              downloadFilename={message.plain.filename ?? "video.webm"}
            />
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
            {message.mine && message.status === "queued" && (
              <span className="ml-1 text-[10px] text-amber-200">в очереди</span>
            )}
            {message.status === "failed" && (
              <button type="button" onClick={() => onRetry?.(message.id)} className="ml-2 underline">
                повторить
              </button>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
