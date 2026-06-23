"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionStatus } from "./ConnectionStatus";
import { MessageBubble, type DisplayMessage } from "./MessageBubble";
import { MessengerShell } from "./MessengerShell";
import { MAX_TEXT_LENGTH } from "@/lib/messenger/constants";
import {
  ackMessage,
  pollChannel,
  sendEncryptedMessage,
} from "@/lib/messenger/client";
import {
  decryptMessage,
  encryptMessage,
  type PlainMessage,
} from "@/lib/messenger/crypto";
import type { EncryptedMessagePayload } from "@/lib/messenger/types";
import { generateMessageId } from "@/lib/messenger/codes";
import { blobToBase64, compressImageIfNeeded } from "@/lib/messenger/files";

interface Props {
  channel: string;
  title: string;
  subtitle?: React.ReactNode;
  backHref: string;
  myPhone: string;
  aesKey: CryptoKey;
  isRoom?: boolean;
  roomId?: string;
  onLeaveRoom?: (participantCount: number) => void | Promise<void>;
  onRoomEnded?: () => void;
}

export function ChatView({
  channel,
  title,
  subtitle,
  backHref,
  myPhone,
  aesKey,
  isRoom,
  roomId,
  onLeaveRoom,
  onRoomEnded,
}: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [text, setText] = useState("");
  const [version, setVersion] = useState(0);
  const [connection, setConnection] = useState<"online" | "reconnecting" | "offline">("reconnecting");
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const versionRef = useRef(0);
  const seenIds = useRef(new Set<string>());

  const decryptPayload = useCallback(
    async (msg: EncryptedMessagePayload): Promise<DisplayMessage | null> => {
      try {
        const plain = await decryptMessage(aesKey, msg.ciphertext, msg.iv);
        return {
          id: msg.id,
          mine: msg.from === myPhone,
          ts: msg.ts,
          plain,
          type: msg.type,
          status: "sent",
        };
      } catch {
        return null;
      }
    },
    [aesKey, myPhone],
  );

  const ingestMessages = useCallback(
    async (incoming: EncryptedMessagePayload[]) => {
      for (const msg of incoming) {
        if (seenIds.current.has(msg.id)) continue;
        if (msg.from === myPhone) {
          seenIds.current.add(msg.id);
          continue;
        }
        const display = await decryptPayload(msg);
        if (display) {
          seenIds.current.add(msg.id);
          setMessages((prev) => [...prev, display]);
          void ackMessage(channel, msg.id);
        }
      }
    },
    [channel, decryptPayload, myPhone],
  );

  useEffect(() => {
    let cancelled = false;
    let intervalMs = 2000;

    async function tick() {
      if (document.hidden) intervalMs = 12000;
      else intervalMs = 2000;

      try {
        const data = await pollChannel(channel, versionRef.current, !!isRoom);
        if (cancelled) return;
        if (!data) {
          setConnection("offline");
          return;
        }
        if ("error" in data) {
          if (data.error === "room_gone") onRoomEnded?.();
          return;
        }
        setConnection("online");
        if (data.meta.version > versionRef.current) {
          versionRef.current = data.meta.version;
          setVersion(data.meta.version);
        }
        if (data.participants) {
          setParticipantCount(data.participants.length);
        }
        if (data.messages.length) {
          await ingestMessages(data.messages);
        }
      } catch {
        setConnection("reconnecting");
      }
    }

    void tick();
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [channel, ingestMessages, isRoom, onRoomEnded]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof window === "undefined" || !window.visualViewport) return;

    function onViewportResize() {
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }

    window.visualViewport.addEventListener("resize", onViewportResize);
    return () => window.visualViewport?.removeEventListener("resize", onViewportResize);
  }, []);

  async function sendPlain(type: "text" | "image" | "file", plain: PlainMessage) {
    const localId = generateMessageId();
    const optimistic: DisplayMessage = {
      id: localId,
      mine: true,
      ts: Date.now(),
      plain,
      type,
      status: "pending",
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { ciphertext, iv } = await encryptMessage(aesKey, plain);
      const result = await sendEncryptedMessage({
        channel,
        type,
        ciphertext,
        iv,
        mime: plain.mime,
        filename: plain.filename,
      });
      if (!result) throw new Error("send failed");
      versionRef.current = result.version;
      setVersion(result.version);
      seenIds.current.add(result.messageId);
      setMessages((prev) =>
        prev.map((m) => (m.id === localId ? { ...m, id: result.messageId, status: "sent" } : m)),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === localId ? { ...m, status: "failed" } : m)),
      );
    }
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    await sendPlain("text", { text: trimmed });
  }

  async function handleFile(file: File) {
    const { blob, compressed } = await compressImageIfNeeded(file);
    if (compressed) {
      alert("Изображение сжато для отправки");
    }
    const data = await blobToBase64(blob);
    const type = file.type.startsWith("image/") ? "image" : "file";
    await sendPlain(type, {
      data,
      mime: blob.type || file.type,
      filename: file.name,
    });
  }

  const headerSubtitle = (
    <div className="flex items-center gap-2">
      <ConnectionStatus status={connection} />
      {isRoom && participantCount !== null && (
        <span className="text-xs text-gray-400">· {participantCount} уч.</span>
      )}
      {subtitle}
    </div>
  );

  const canSend = text.trim().length > 0;

  return (
    <MessengerShell
      variant="chat"
      title={title}
      subtitle={headerSubtitle}
      backHref={backHref}
      trailing={
        isRoom && onLeaveRoom ? (
          <button
            type="button"
            onClick={() => void onLeaveRoom(participantCount ?? 1)}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Выйти
          </button>
        ) : undefined
      }
    >
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 py-3 space-y-2 overscroll-contain"
        style={{
          backgroundColor: "#eceff1",
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgb(15 23 42 / 0.035) 1px, transparent 0)",
          backgroundSize: "18px 18px",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {messages.length === 0 && (
          <div
            className="max-w-md"
            style={{
              marginLeft: "max(0.75rem, env(safe-area-inset-left))",
              marginRight: "max(0.75rem, env(safe-area-inset-right))",
            }}
          >
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/95 px-4 py-3 text-sm text-amber-900 shadow-sm">
              <p className="font-medium">Сообщения не сохраняются на сервере</p>
              <p className="text-xs mt-1 text-amber-800/80">
                История недоступна после перезагрузки страницы.
              </p>
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} className="h-1" />
      </div>

      <div
        className="shrink-0 border-t border-gray-200 bg-white/95 backdrop-blur"
        style={{
          paddingTop: "0.625rem",
          paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right))",
        }}
      >
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
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
            rows={1}
            placeholder="Сообщение"
            className="min-w-0 flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-base leading-snug max-h-32 focus:outline-none focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"
            style={{ fontSize: "16px" }}
            onFocus={() => {
              window.setTimeout(() => {
                bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
              }, 300);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <button
            type="button"
            disabled={!canSend}
            onClick={() => void handleSend()}
            aria-label="Отправить"
            className={`mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
              canSend
                ? "bg-sky-600 text-white hover:bg-sky-700"
                : "bg-gray-200 text-gray-400"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M3.4 20.4 21 12 3.4 3.6 3 11l8 1-8 1z" />
            </svg>
          </button>
        </div>
      </div>
    </MessengerShell>
  );
}
