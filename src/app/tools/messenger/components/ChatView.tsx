"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "@/components/music/ConfirmDialog";
import { ChatComposer, type MediaSendPayload } from "./ChatComposer";
import { ConnectionStatus } from "./ConnectionStatus";
import { MessageBubble, type DisplayMessage } from "./MessageBubble";
import { MessengerShell } from "./MessengerShell";
import { IconSettings } from "@/components/PlatformIcons";
import { useMessengerUnlock } from "./MessengerUnlockProvider";
import { SENDER_GROUP_MS } from "@/lib/messenger/constants";
import {
  ackMessage,
  markDmDialogRead,
  markRoomDialogRead,
  isReceiptEnvelope,
  pollChannel,
  sendTypingStatus,
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
  rekeyHistoryMessage,
  saveHistoryMessage,
  updateHistoryDeliveryStatus,
} from "@/lib/messenger/history-db";
import type { ChannelEnvelope, DeliveryStatus, EncryptedMessagePayload } from "@/lib/messenger/types";
import { generateMessageId } from "@/lib/messenger/codes";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { blobToBase64, compressImageIfNeeded } from "@/lib/messenger/files";
import { refreshAppBadge } from "@/lib/messenger/app-badge";
import { scrollChatListToBottom, isChatListNearBottom } from "@/lib/messenger/use-visual-viewport";
import { onAppResume } from "@/lib/platform/app-resume";
import {
  clearRoomUnread,
  setActiveChatChannel,
} from "@/lib/messenger/unread";
import { useCallOptional } from "./call/CallProvider";
import { DmCallHeaderButton } from "./call/DmCallHeaderButton";
import { getMessengerRealtimeClient } from "@/lib/messenger/realtime/client";
import { normalizeKzPhone, peerFromDmChannel } from "@/lib/messenger/phone";

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
  identityAlert?: { previousShort: string | null; currentShort: string };
  onTrustIdentity?: () => void;
  initialDraftText?: string;
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
  identityAlert,
  onTrustIdentity,
  initialDraftText,
}: Props) {
  const { storageKey, isUnlocked } = useMessengerUnlock();
  const callCtx = useCallOptional();
  const inCall = callCtx?.isInCall ?? false;
  const persistHistory = isUnlocked && storageKey !== null;

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [text, setText] = useState(initialDraftText ?? "");
  const [replyTo, setReplyTo] = useState<DisplayMessage | null>(null);
  const swipeToReply = useCoarsePointer();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const [connection, setConnection] = useState<"online" | "reconnecting" | "offline">("reconnecting");
  const [peerOnline, setPeerOnline] = useState<boolean | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const versionRef = useRef(0);
  const seenIds = useRef(new Set<string>());
  const sentReceipts = useRef(new Set<string>());
  const readSentRef = useRef(new Set<string>());
  const pendingOwnReceipts = useRef(new Map<string, "delivered" | "read">());
  const messagesRef = useRef<DisplayMessage[]>([]);
  const initialAnchorDoneRef = useRef(false);
  const storageKeyRef = useRef(storageKey);
  const lastTypingPingAtRef = useRef(0);
  const typingActiveRef = useRef(false);
  const textRef = useRef(text);
  storageKeyRef.current = storageKey;
  textRef.current = text;

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

  const closeMenu = useCallback(() => {
    setShowMenu(false);
    setMenuAnchor(null);
  }, []);

  const toggleMenu = useCallback(() => {
    if (showMenu) {
      closeMenu();
      return;
    }
    const rect = menuRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuAnchor({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setShowMenu(true);
  }, [closeMenu, showMenu]);

  useEffect(() => {
    setActiveChatChannel(channel);
    return () => setActiveChatChannel(null);
  }, [channel]);

  useEffect(() => {
    initialAnchorDoneRef.current = false;
  }, [channel]);

  useEffect(() => {
    if (!initialDraftText) return;
    setText(initialDraftText);
  }, [channel, initialDraftText]);

  useEffect(() => {
    if (isRoom && roomId) {
      const markRead = () => {
        if (document.visibilityState !== "visible") return;
        void markRoomDialogRead(roomId);
      };
      markRead();
      const onVisible = () => markRead();
      document.addEventListener("visibilitychange", onVisible);
      const removeResume = onAppResume(() => markRead());
      return () => {
        document.removeEventListener("visibilitychange", onVisible);
        removeResume();
      };
    }
    if (!channel.startsWith("dm:")) return;
    const markRead = () => {
      if (document.visibilityState !== "visible") return;
      void markDmDialogRead(channel);
    };
    markRead();
    const onVisible = () => markRead();
    document.addEventListener("visibilitychange", onVisible);
    const removeResume = onAppResume(() => markRead());
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      removeResume();
    };
  }, [channel, isRoom, roomId]);

  useEffect(() => {
    if (!isRoom) setPeerOnline(null);
  }, [channel, isRoom]);

  useEffect(() => {
    setPeerTyping(false);
  }, [channel]);

  useEffect(() => {
    pendingOwnReceipts.current.clear();
  }, [channel]);

  useEffect(() => {
    if (isRoom || !channel.startsWith("dm:")) return;
    const maybeSendTyping = (active: boolean) => {
      if (active) {
        const now = Date.now();
        if (now - lastTypingPingAtRef.current < 1200) return;
        lastTypingPingAtRef.current = now;
      }
      void sendTypingStatus(channel, active);
    };

    const hasText = text.trim().length > 0;
    const canTypeNow = hasText && document.visibilityState === "visible";
    if (canTypeNow) {
      typingActiveRef.current = true;
      maybeSendTyping(true);
    } else if (typingActiveRef.current) {
      typingActiveRef.current = false;
      maybeSendTyping(false);
    }
  }, [channel, isRoom, text]);

  useEffect(() => {
    if (isRoom || !channel.startsWith("dm:")) return;
    const onVisibility = () => {
      const hasText = textRef.current.trim().length > 0;
      if (document.visibilityState === "visible" && hasText) {
        typingActiveRef.current = true;
        void sendTypingStatus(channel, true);
        return;
      }
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        void sendTypingStatus(channel, false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        void sendTypingStatus(channel, false);
      }
    };
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

      const rank = (status: "delivered" | "read") => (status === "read" ? 2 : 1);
      const pending = pendingOwnReceipts.current.get(receipt.refMessageId);
      if (!pending || rank(receipt.receipt) > rank(pending)) {
        pendingOwnReceipts.current.set(receipt.refMessageId, receipt.receipt);
        if (pendingOwnReceipts.current.size > 500) {
          const oldestKey = pendingOwnReceipts.current.keys().next().value;
          if (oldestKey) pendingOwnReceipts.current.delete(oldestKey);
        }
      }

      const statusFromReceipt = (value: "delivered" | "read"): DeliveryStatus =>
        value === "read" ? "read" : "delivered";

      let didApply = false;
      setMessages((prev) => {
        const target = prev.find((m) => m.id === receipt.refMessageId && m.mine);
        if (!target) return prev;
        const nextStatus = statusFromReceipt(receipt.receipt);
        if (target.status === "read") return prev;
        if (target.status === "delivered" && nextStatus === "delivered") return prev;
        didApply = true;
        return prev.map((m) =>
          m.id === receipt.refMessageId ? { ...m, status: nextStatus } : m,
        );
      });
      if (!didApply) return;

      pendingOwnReceipts.current.delete(receipt.refMessageId);
      if (persistHistory) {
        const nextStatus = statusFromReceipt(receipt.receipt);
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
          const consumePendingOwnStatus = (messageId: string): DeliveryStatus => {
            const pending = pendingOwnReceipts.current.get(messageId);
            if (!pending) return "sent";
            pendingOwnReceipts.current.delete(messageId);
            return pending === "read" ? "read" : "delivered";
          };
          const clientMessageId =
            typeof msg.clientMessageId === "string" ? msg.clientMessageId.trim() : "";
          if (clientMessageId) {
            const hasPendingLocal = messagesRef.current.some(
              (m) => m.id === clientMessageId && m.mine,
            );
            if (hasPendingLocal) {
              const nextStatus = consumePendingOwnStatus(msg.id);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === clientMessageId
                    ? {
                        ...m,
                        id: msg.id,
                        ts: msg.ts,
                        fromPhone: msg.from,
                        status: m.status === "read" ? "read" : nextStatus,
                      }
                    : m,
                ),
              );
              if (persistHistory) {
                await rekeyHistoryMessage(clientMessageId, msg.id, nextStatus);
              }
              seenIds.current.add(clientMessageId);
              seenIds.current.add(msg.id);
              continue;
            }
          }
          if (seenIds.current.has(msg.id)) continue;
          const ownDisplay = await decryptPayload(msg);
          if (!ownDisplay) continue;
          const ownStatus = consumePendingOwnStatus(msg.id);
          const own = { ...ownDisplay, mine: true, status: ownStatus };
          setMessages((prev) => (prev.some((m) => m.id === own.id) ? prev : [...prev, own]));
          if (persistHistory) await persistMessage(own);
          seenIds.current.add(msg.id);
          continue;
        }
        const display = await decryptPayload(msg);
        if (!display) continue;
        seenIds.current.add(msg.id);
        setMessages((prev) => [...prev, display]);
        if (persistHistory) await persistMessage(display);
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
    [channel, decryptPayload, handleReceipt, myPhone, persistHistory, persistMessage],
  );

  useEffect(() => {
    let cancelled = false;
    let timerId: number | undefined;
    let inFlight = false;
    let presenceTimer: number | undefined;
    const realtime = getMessengerRealtimeClient();

    const intervalMs = () => {
      if (realtime.shouldUsePollingFallback()) {
        if (inCall) return 12000;
        return document.hidden ? 12000 : 350;
      }
      if (inCall) return 12000;
      return document.hidden ? 12000 : 8000;
    };

    const applyPollResult = async (data: NonNullable<Awaited<ReturnType<typeof pollChannel>>>) => {
      if ("error" in data) {
        if (data.error === "room_gone") onRoomEnded?.();
        return;
      }
      setConnection("online");
      if (!isRoom && typeof data.peerOnline === "boolean") {
        setPeerOnline(data.peerOnline);
      }
      if (!isRoom && typeof data.peerTyping === "boolean") {
        setPeerTyping(data.peerTyping);
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
    };

    const scheduleNext = () => {
      if (cancelled) return;
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
      timerId = window.setTimeout(() => {
        void tick();
      }, intervalMs());
    };

    async function tick() {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const data = await pollChannel(channel, versionRef.current, !!isRoom, {
          wait: realtime.shouldUsePollingFallback() && !document.hidden && !inCall,
        });
        if (cancelled) return;
        if (!data) {
          setConnection("offline");
          return;
        }
        await applyPollResult(data);
      } catch {
        setConnection("reconnecting");
      } finally {
        inFlight = false;
        scheduleNext();
      }
    }

    const pingPresence = () => {
      if (cancelled || document.hidden) return;
      if (!realtime.shouldUsePollingFallback()) {
        realtime.sendPresence(channel);
      }
    };

    realtime.subscribeChannels([channel]);
    const unsubEvents = realtime.subscribe((event) => {
      if (cancelled) return;
      if (event.type === "envelopes" && event.channel === channel) {
        void (async () => {
          setConnection("online");
          if (event.version > versionRef.current) {
            versionRef.current = event.version;
          }
          if (event.envelopes.length) {
            await ingestEnvelopes(event.envelopes);
          }
        })();
        return;
      }
      if (event.type === "typing" && event.channel === channel && !isRoom) {
        setPeerTyping(event.active);
        return;
      }
      if (event.type === "peer_online" && !isRoom) {
        const peer = peerFromDmChannel(channel, myPhone);
        if (peer && normalizeKzPhone(event.phone) === normalizeKzPhone(peer)) {
          setPeerOnline(event.online);
        }
      }
    });
    const unsubMode = realtime.onModeChange((mode) => {
      if (mode === "websocket") {
        pingPresence();
        void tick();
      }
      scheduleNext();
    });

    void tick();
    pingPresence();
    presenceTimer = window.setInterval(pingPresence, 20_000);

    const removeResume = onAppResume(() => void tick());
    const onVisibility = () => {
      if (document.hidden) {
        scheduleNext();
        return;
      }
      pingPresence();
      void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
      if (presenceTimer !== undefined) {
        clearInterval(presenceTimer);
      }
      unsubEvents();
      unsubMode();
      realtime.unsubscribeChannels([channel]);
      document.removeEventListener("visibilitychange", onVisibility);
      removeResume();
    };
  }, [channel, ingestEnvelopes, isRoom, onRoomEnded, inCall, myPhone]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || !isChatListNearBottom(el)) return;
    scrollChatListToBottom(el);
  }, [messages]);

  useEffect(() => {
    if (!historyLoaded || initialAnchorDoneRef.current) return;
    if (messages.length === 0) return;
    const root = listRef.current;
    if (!root) return;

    initialAnchorDoneRef.current = true;
    const firstUnread = messages.find((m) => !m.mine && m.status !== "read");
    if (!firstUnread) {
      scrollChatListToBottom(root);
      return;
    }

    requestAnimationFrame(() => {
      const target = root.querySelector<HTMLElement>(`[data-message-id="${firstUnread.id}"]`);
      if (!target) return;
      target.scrollIntoView({ block: "start", behavior: "auto" });
      root.scrollTop = Math.max(0, root.scrollTop - 10);
    });
  }, [historyLoaded, messages]);

  const scrollMessagesToBottom = useCallback(() => {
    scrollChatListToBottom(listRef.current);
  }, []);

  const scrollMessagesToBottomSoon = useCallback(() => {
    requestAnimationFrame(() => {
      scrollChatListToBottom(listRef.current);
      setTimeout(() => scrollChatListToBottom(listRef.current), 40);
    });
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
      scrollMessagesToBottomSoon();
      if (persistHistory) await persistMessage(optimistic);
      setReplyTo(null);

      try {
        const { ciphertext, iv } = await encryptMessage(aesKey, fullPlain);
        const pushPreview = truncateQuote(
          messagePreview({ ...fullPlain, type, mime: fullPlain.mime }),
          120,
        );
        const result = await sendEncryptedMessage({
          channel,
          clientMessageId: localId,
          type,
          ciphertext,
          iv,
          mime: fullPlain.mime,
          filename: fullPlain.filename,
          pushPreview,
        });
        if (!result) throw new Error("send failed");
        if (result.version > 0) {
          versionRef.current = Math.max(versionRef.current, result.version);
        }
        if (result.queued) {
          setMessages((prev) =>
            prev.map((m) => (m.id === localId ? { ...m, status: "queued" } : m)),
          );
          if (persistHistory) await updateHistoryDeliveryStatus(localId, "queued");
          return;
        }
        seenIds.current.add(localId);
        seenIds.current.add(result.messageId);
        const pendingReceipt = pendingOwnReceipts.current.get(result.messageId);
        const sentStatus: DeliveryStatus =
          pendingReceipt === "read" ? "read" : pendingReceipt === "delivered" ? "delivered" : "sent";
        if (pendingReceipt) {
          pendingOwnReceipts.current.delete(result.messageId);
        }
        const sent: DisplayMessage = {
          ...optimistic,
          id: result.messageId,
          status: sentStatus,
        };
        setMessages((prev) =>
          prev.map((m) => (m.id === localId ? sent : m)),
        );
        scrollMessagesToBottomSoon();
        if (persistHistory) {
          await rekeyHistoryMessage(localId, result.messageId, sentStatus);
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === localId ? { ...m, status: "failed" } : m)),
        );
        scrollMessagesToBottomSoon();
        if (persistHistory) await updateHistoryDeliveryStatus(localId, "failed");
      }
    },
    [aesKey, buildPlain, channel, myPhone, persistHistory, persistMessage, decryptPayload, scrollMessagesToBottomSoon],
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
    const ext = payload.mime.includes("mp4") ? "mp4" : "webm";
    await sendPlain(payload.type, {
      data,
      mime: payload.mime,
      durationMs: payload.durationMs,
      waveformPeaks: payload.waveformPeaks,
      filename: payload.type === "audio" ? `voice.${ext}` : `video.${ext}`,
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
    closeMenu();
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
  const firstUnreadIndex = messages.findIndex((m) => !m.mine && m.status !== "read");

  const clearChatConfirmTitle = isRoom
    ? `Удалить историю комнаты ${title} на этом устройстве? Это нельзя отменить.`
    : `Удалить всю историю переписки с ${title}? Это нельзя отменить. У собеседника история останется.`;

  const headerTrailing = (
    <div className="flex items-center gap-1">
      {!isRoom && callCtx && <DmCallHeaderButton peerOnline={peerOnline} />}
      {isRoom && roomId && (
        <Link
          href={`/tools/messenger/room/settings?id=${encodeURIComponent(roomId)}`}
          className="flex h-10 w-10 items-center justify-center rounded-full shrink-0 transition-colors text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-100 touch-manipulation"
          aria-label="Настройки комнаты"
          title="Настройки комнаты"
        >
          <IconSettings />
        </Link>
      )}
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
            onClick={toggleMenu}
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="Меню чата"
            aria-expanded={showMenu}
          >
            ⋮
          </button>
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
    <>
      <MessengerShell
        variant="chat"
        title={title}
        subtitle={headerSubtitle}
        backHref={backHref}
        trailing={headerTrailing}
      >
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 py-3 space-y-2 overscroll-y-contain touch-pan-y relative"
          style={{
            backgroundColor: "#eceff1",
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgb(15 23 42 / 0.035) 1px, transparent 0)",
            backgroundSize: "18px 18px",
            WebkitOverflowScrolling: "touch",
          }}
        >
        {!isRoom && identityAlert && (
          <div
            className="max-w-2xl"
            style={{
              marginLeft: "max(0.75rem, env(safe-area-inset-left))",
              marginRight: "max(0.75rem, env(safe-area-inset-right))",
            }}
          >
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
              <p className="font-semibold">Ключ безопасности контакта изменился</p>
              <p className="mt-1 text-xs text-amber-900/80">
                Это может быть переустановка приложения у собеседника или потенциальная подмена ключа.
              </p>
              <p className="mt-1 text-[11px] text-amber-900/80">
                Было: {identityAlert.previousShort ?? "—"} · Сейчас: {identityAlert.currentShort}
              </p>
              {onTrustIdentity && (
                <button
                  type="button"
                  onClick={onTrustIdentity}
                  className="mt-2 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Доверять новому ключу
                </button>
              )}
            </div>
          </div>
        )}
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
          <div key={m.id}>
            {index === firstUnreadIndex && (
              <div
                className="flex items-center gap-2 px-3 py-1.5"
                style={{
                  marginLeft: "max(0.75rem, env(safe-area-inset-left))",
                  marginRight: "max(0.75rem, env(safe-area-inset-right))",
                }}
              >
                <div className="h-px flex-1 bg-sky-200/90" />
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-700">
                  Непрочитанные сообщения
                </span>
                <div className="h-px flex-1 bg-sky-200/90" />
              </div>
            )}
            <MessageBubble
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
          </div>
        ))}
        {!isRoom && peerTyping && (
          <div
            className="flex w-full justify-start"
            style={{
              paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
              paddingRight: "max(0.75rem, env(safe-area-inset-right))",
            }}
          >
            <div className="rounded-2xl rounded-bl-md border border-gray-200 bg-white px-3 py-2 shadow-sm">
              <div className="flex items-center gap-1.5 text-gray-500" aria-label="печатает">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
              </div>
            </div>
          </div>
        )}
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
        />
      </MessengerShell>

      {showMenu &&
        menuAnchor &&
        createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[200] cursor-default bg-transparent"
              aria-label="Закрыть меню"
              onClick={closeMenu}
            />
            <div
              className="fixed z-[201] w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
              style={{ top: menuAnchor.top, right: menuAnchor.right }}
            >
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  setShowClearConfirm(true);
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                Очистить чат
              </button>
            </div>
          </>,
          document.body,
        )}

      <ConfirmDialog
        open={showClearConfirm}
        title={clearChatConfirmTitle}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        destructive
        onConfirm={() => void handleClearChat()}
        onCancel={() => setShowClearConfirm(false)}
      />
    </>
  );
}
