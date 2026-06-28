"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatComposer, type MediaSendPayload } from "./ChatComposer";
import { ConnectionStatus } from "./ConnectionStatus";
import { MessageBubble, type DisplayMessage } from "./MessageBubble";
import { MessengerShell } from "./MessengerShell";
import { useMessengerUnlock } from "./MessengerUnlockProvider";
import { SENDER_GROUP_MS } from "@/lib/messenger/constants";
import {
  ackMessage,
  isReceiptEnvelope,
  pollChannel,
  sendEncryptedMessage,
  sendReceipt,
} from "@/lib/messenger/client";
import {
  decryptMessage,
  encryptMessage,
  type PlainMessage,
} from "@/lib/messenger/crypto";
import { senderColorClass, truncateQuote, messagePreview } from "@/lib/messenger/display";
import {
  clearChatHistory,
  loadChatHistory,
  saveHistoryMessage,
  updateHistoryDeliveryStatus,
} from "@/lib/messenger/history-db";
import type { ChannelEnvelope, EncryptedMessagePayload } from "@/lib/messenger/types";
import { generateMessageId } from "@/lib/messenger/codes";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { blobToBase64, compressImageIfNeeded } from "@/lib/messenger/files";
import { refreshAppBadge } from "@/lib/messenger/app-badge";
import { scrollChatListToBottom, isChatListNearBottom } from "@/lib/messenger/use-visual-viewport";
import {
  clearRoomUnread,
  incrementRoomUnread,
  setActiveChatChannel,
} from "@/lib/messenger/unread";

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
  profileLabels?: Record<string, string>;
}

function isMessageEnvelope(e: ChannelEnvelope): e is EncryptedMessagePayload {
  return !("kind" in e) || e.kind === "message" || !e.kind;
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
  profileLabels = {},
}: Props) {
  const { storageKey, isUnlocked } = useMessengerUnlock();
  const persistHistory = isUnlocked && storageKey !== null;

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [text, setText] = useState("");
  const [composerHeight, setComposerHeight] = useState(72);
  const [replyTo, setReplyTo] = useState<DisplayMessage | null>(null);
  const swipeToReply = useCoarsePointer();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [connection, setConnection] = useState<"online" | "reconnecting" | "offline">("reconnecting");
  const [peerOnline, setPeerOnline] = useState<boolean | null>(null);
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const versionRef = useRef(0);
  const seenIds = useRef(new Set<string>());
  const sentReceipts = useRef(new Set<string>());
  const readSentRef = useRef(new Set<string>());
  const messagesRef = useRef<DisplayMessage[]>([]);
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const labelForPhone = useCallback(
    (phone: string) => profileLabels[phone] ?? phone,
    [profileLabels],
  );

  const persistMessage = useCallback(
    async (msg: DisplayMessage) => {
      const key = storageKeyRef.current;
      if (!key || !msg.plain) return;
      await saveHistoryMessage(key, {
        id: msg.id,
        chatId: channel,
        ts: msg.ts,
        mine: msg.mine,
        type: msg.type,
        deliveryStatus: msg.status ?? "sent",
        fromPhone: msg.fromPhone,
        plain: msg.plain,
      });
      void refreshAppBadge();
    },
    [channel],
  );


  useEffect(() => {
    if (!persistHistory || !storageKey) {
      setHistoryLoaded(true);
      return;
    }
    let cancelled = false;
    void loadChatHistory(storageKey, channel).then((history) => {
      if (cancelled) return;
      const loaded: DisplayMessage[] = history.map((h) => ({
        id: h.id,
        mine: h.mine,
        ts: h.ts,
        plain: h.plain,
        type: h.type,
        status: h.deliveryStatus,
        fromPhone: h.fromPhone,
      }));
      for (const m of loaded) seenIds.current.add(m.id);
      setMessages(loaded);
      setHistoryLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [channel, persistHistory, storageKey]);

  useEffect(() => {
    if (!showMenu) return;
    function handleOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showMenu]);

  useEffect(() => {
    setActiveChatChannel(channel);
    return () => setActiveChatChannel(null);
  }, [channel]);

  useEffect(() => {
    if (!isRoom) setPeerOnline(null);
  }, [channel, isRoom]);

  useEffect(() => {
    if (isRoom && roomId) {
      clearRoomUnread(`room:${roomId}`);
    }
    void refreshAppBadge();
  }, [isRoom, roomId]);

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
          status: "delivered",
          fromPhone: msg.from,
        };
      } catch {
        return null;
      }
    },
    [aesKey, myPhone],
  );

  const handleReceipt = useCallback(
    async (receipt: { refMessageId: string; receipt: "delivered" | "read"; from: string }) => {
      if (receipt.from === myPhone) return;
      setMessages((prev) => {
        const target = prev.find((m) => m.id === receipt.refMessageId && m.mine);
        if (!target) return prev;
        const nextStatus = receipt.receipt === "read" ? "read" : "delivered";
        if (target.status === "read") return prev;
        if (target.status === "delivered" && nextStatus === "delivered") return prev;
        return prev.map((m) =>
          m.id === receipt.refMessageId ? { ...m, status: nextStatus } : m,
        );
      });
      const target = messagesRef.current.find((m) => m.id === receipt.refMessageId && m.mine);
      if (target && persistHistory) {
        const nextStatus = receipt.receipt === "read" ? "read" : "delivered";
        await updateHistoryDeliveryStatus(receipt.refMessageId, nextStatus);
      }
    },
    [myPhone, persistHistory],
  );

  const ingestEnvelopes = useCallback(
    async (envelopes: ChannelEnvelope[]) => {
      for (const envelope of envelopes) {
        if (isReceiptEnvelope(envelope)) {
          if (seenIds.current.has(envelope.id)) continue;
          seenIds.current.add(envelope.id);
          await handleReceipt(envelope);
          void ackMessage(channel, envelope.id);
          continue;
        }
        if (!isMessageEnvelope(envelope)) continue;
        const msg = envelope;
        if (seenIds.current.has(msg.id)) continue;
        if (msg.from === myPhone) {
          seenIds.current.add(msg.id);
          continue;
        }
        const display = await decryptPayload(msg);
        if (!display) continue;
        seenIds.current.add(msg.id);
        setMessages((prev) => [...prev, display]);
        if (persistHistory) await persistMessage(display);
        if (isRoom && roomId) {
          incrementRoomUnread(`room:${roomId}`, channel);
        }
        void refreshAppBadge();

        const deliveredKey = `delivered:${msg.id}`;
        if (!sentReceipts.current.has(deliveredKey)) {
          sentReceipts.current.add(deliveredKey);
          void sendReceipt({ channel, refMessageId: msg.id, receipt: "delivered" }).then((r) => {
            if (r) {
              versionRef.current = Math.max(versionRef.current, r.version);
            }
          });
        }
        void ackMessage(channel, msg.id);
      }
    },
    [channel, decryptPayload, handleReceipt, isRoom, myPhone, persistHistory, persistMessage, roomId],
  );

  useEffect(() => {
    let cancelled = false;
    const intervalMs = () => (document.hidden ? 12000 : 2000);

    async function tick() {
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
        if (!isRoom && typeof data.peerOnline === "boolean") {
          setPeerOnline(data.peerOnline);
        }
        if (data.meta.version > versionRef.current) {
          versionRef.current = data.meta.version;
        }
        if (data.participants) {
          setParticipantCount(data.participants.length);
        }
        const envelopes = data.envelopes ?? data.messages;
        if (envelopes.length) {
          await ingestEnvelopes(envelopes);
        }
      } catch {
        setConnection("reconnecting");
      }
    }

    void tick();
    const id = window.setInterval(() => void tick(), intervalMs());
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [channel, ingestEnvelopes, isRoom, onRoomEnded]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !isChatListNearBottom(el)) return;
    scrollChatListToBottom(el);
  }, [messages]);

  const scrollMessagesToBottom = useCallback(() => {
    scrollChatListToBottom(listRef.current);
  }, []);

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;

    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.messageId;
          if (!id) continue;
          const msg = messagesRef.current.find((m) => m.id === id);
          if (!msg || msg.mine) continue;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
            if (readSentRef.current.has(id)) continue;
            const existing = timers.get(id);
            if (existing) clearTimeout(existing);
            timers.set(
              id,
              setTimeout(() => {
                readSentRef.current.add(id);
                if (persistHistory) {
                  void updateHistoryDeliveryStatus(id, "read").then(() => refreshAppBadge());
                }
                void sendReceipt({ channel, refMessageId: id, receipt: "read" });
                setMessages((prev) =>
                  prev.map((m) => (m.id === id ? { ...m, status: "read" } : m)),
                );
              }, 400),
            );
          } else {
            const existing = timers.get(id);
            if (existing) {
              clearTimeout(existing);
              timers.delete(id);
            }
          }
        }
      },
      { root, threshold: [0, 0.7, 1] },
    );

    root.querySelectorAll("[data-message-id]").forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      timers.forEach((t) => clearTimeout(t));
    };
  }, [channel, messages, persistHistory]);

  const buildPlain = useCallback(
    (base: PlainMessage): PlainMessage => {
      if (!replyTo?.plain) return base;
      const preview = truncateQuote(
        messagePreview({
          ...base,
          text: base.text ?? replyTo.plain?.text,
          type: replyTo.type,
          mime: replyTo.plain?.mime,
        }),
      );
      return {
        ...base,
        quotedMessageId: replyTo.id,
        quotedAuthor: replyTo.mine ? "Вы" : labelForPhone(replyTo.fromPhone ?? title),
        quotedText: preview,
      };
    },
    [labelForPhone, replyTo, title],
  );

  const sendPlain = useCallback(
    async (type: "text" | "image" | "file" | "audio" | "video", plain: PlainMessage) => {
      const fullPlain = buildPlain(plain);
      const localId = generateMessageId();
      const optimistic: DisplayMessage = {
        id: localId,
        mine: true,
        ts: Date.now(),
        plain: fullPlain,
        type,
        status: "pending",
        fromPhone: myPhone,
      };
      setMessages((prev) => [...prev, optimistic]);
      setReplyTo(null);

      try {
        const { ciphertext, iv } = await encryptMessage(aesKey, fullPlain);
        const result = await sendEncryptedMessage({
          channel,
          type,
          ciphertext,
          iv,
          mime: fullPlain.mime,
          filename: fullPlain.filename,
        });
        if (!result) throw new Error("send failed");
        versionRef.current = result.version;
        seenIds.current.add(result.messageId);
        const sent: DisplayMessage = {
          ...optimistic,
          id: result.messageId,
          status: "sent",
        };
        setMessages((prev) =>
          prev.map((m) => (m.id === localId ? sent : m)),
        );
        if (persistHistory) await persistMessage(sent);
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === localId ? { ...m, status: "failed" } : m)),
        );
      }
    },
    [aesKey, buildPlain, channel, myPhone, persistHistory, persistMessage],
  );

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    await sendPlain("text", { text: trimmed });
  }

  async function handleFile(file: File) {
    const { blob, compressed } = await compressImageIfNeeded(file);
    if (compressed) alert("Изображение сжато для отправки");
    const data = await blobToBase64(blob);
    const type = file.type.startsWith("image/") ? "image" : "file";
    await sendPlain(type, {
      data,
      mime: blob.type || file.type,
      filename: file.name,
    });
  }

  async function handleSendMedia(payload: MediaSendPayload) {
    const data = await blobToBase64(payload.blob);
    await sendPlain(payload.type, {
      data,
      mime: payload.mime,
      durationMs: payload.durationMs,
      waveformPeaks: payload.waveformPeaks,
      filename: payload.type === "audio" ? "voice.webm" : "video.webm",
    });
  }

  async function handleRetry(id: string) {
    const msg = messages.find((m) => m.id === id);
    if (!msg?.plain) return;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    await sendPlain(msg.type, msg.plain);
  }

  async function handleClearChat() {
    if (!persistHistory) return;
    await clearChatHistory(channel);
    setMessages([]);
    seenIds.current.clear();
    setShowClearConfirm(false);
    setShowMenu(false);
    void refreshAppBadge();
  }

  function scrollToMessage(messageId: string) {
    const el = listRef.current?.querySelector(`[data-message-id="${messageId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function shouldShowSender(index: number): boolean {
    if (!isRoom) return false;
    const msg = messages[index];
    if (msg.mine) return false;
    const prev = messages[index - 1];
    if (!prev || prev.mine) return true;
    if (prev.fromPhone !== msg.fromPhone) return true;
    return msg.ts - prev.ts > SENDER_GROUP_MS;
  }

  const headerSubtitle = (
    <div className="flex items-center gap-2 flex-wrap">
      {!isRoom && peerOnline !== null && (
        <ConnectionStatus status={peerOnline ? "online" : "offline"} variant="peer" />
      )}
      {connection !== "online" && (
        <ConnectionStatus status={connection} variant="connection" />
      )}
      {isRoom && participantCount !== null && (
        <span className="text-xs text-gray-400">· {participantCount} уч.</span>
      )}
      {subtitle}
    </div>
  );

  const messageIds = new Set(messages.map((m) => m.id));

  const headerTrailing = (
    <div className="flex items-center gap-1">
      {isRoom && onLeaveRoom && (
        <button
          type="button"
          onClick={() => void onLeaveRoom(participantCount ?? 1)}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Выйти
        </button>
      )}
      {persistHistory && (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Меню чата"
            aria-expanded={showMenu}
          >
            ⋮
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border border-gray-200 bg-white shadow-lg py-1">
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  setShowClearConfirm(true);
                }}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                Очистить чат
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!historyLoaded) {
    return (
      <MessengerShell variant="chat" title={title} backHref={backHref}>
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Загрузка истории…
        </div>
      </MessengerShell>
    );
  }

  return (
    <MessengerShell
      variant="chat"
      title={title}
      subtitle={headerSubtitle}
      backHref={backHref}
      trailing={headerTrailing}
    >
      {showClearConfirm && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl space-y-4">
            <p className="text-sm text-gray-800">
              {isRoom
                ? `Удалить историю комнаты ${title} на этом устройстве? Это нельзя отменить.`
                : `Удалить всю историю переписки с ${title}? Это нельзя отменить. У собеседника история останется.`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void handleClearChat()}
                className="flex-1 rounded-xl bg-red-600 text-white py-2.5 text-sm font-semibold"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 py-3 space-y-2 overscroll-y-contain touch-pan-y relative"
        style={{
          backgroundColor: "#eceff1",
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgb(15 23 42 / 0.035) 1px, transparent 0)",
          backgroundSize: "18px 18px",
          WebkitOverflowScrolling: "touch",
          paddingBottom: composerHeight,
        }}
      >
        {messages.length === 0 && persistHistory && (
          <div
            className="max-w-md"
            style={{
              marginLeft: "max(0.75rem, env(safe-area-inset-left))",
              marginRight: "max(0.75rem, env(safe-area-inset-right))",
            }}
          >
            <div className="rounded-2xl border border-sky-200/80 bg-sky-50/95 px-4 py-3 text-sm text-sky-900 shadow-sm">
              <p className="font-medium">Переписка хранится на этом устройстве</p>
              <p className="text-xs mt-1 text-sky-800/80">
                {isRoom
                  ? "Зашифровано вашим PIN. Очищается при выходе из комнаты."
                  : "Зашифровано вашим PIN. Сервер не хранит текст."}
              </p>
            </div>
          </div>
        )}
        {messages.map((m, index) => (
          <MessageBubble
            key={m.id}
            message={m}
            onRetry={(id) => void handleRetry(id)}
            onReply={setReplyTo}
            onQuoteClick={scrollToMessage}
            quoteAvailable={!m.plain?.quotedMessageId || messageIds.has(m.plain.quotedMessageId)}
            showSender={shouldShowSender(index)}
            senderLabel={m.fromPhone ? labelForPhone(m.fromPhone) : undefined}
            senderColor={m.fromPhone ? senderColorClass(m.fromPhone) : undefined}
            swipeToReply={swipeToReply}
          />
        ))}
        <div ref={bottomRef} className="h-1" />
      </div>

      <ChatComposer
        text={text}
        onTextChange={setText}
        onSend={() => void handleSend()}
        onFile={(f) => void handleFile(f)}
        onSendMedia={(p) => void handleSendMedia(p)}
        canSend={text.trim().length > 0}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onFocus={scrollMessagesToBottom}
        onHeightChange={setComposerHeight}
      />
    </MessengerShell>
  );
}
