"use client";

import Link from "next/link";
import { messengerChatUrl, messengerRoomUrl } from "@/lib/app-routes";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SettingsHeaderLink } from "@/components/SettingsHeaderButton";
import { MessengerShell } from "../components/MessengerShell";
import { fetchAccessCheck, fetchDmDialogs, logoutMessenger, type DmDialogsResponseItem } from "@/lib/messenger/client";
import { ensureDeviceKeyPublished } from "@/lib/messenger/device-keys";
import { saveLocalDialogs, syncRoomDialogs } from "@/lib/messenger/dialogs";
import { loadChatHistory } from "@/lib/messenger/history-db";
import { maskPhone } from "@/lib/messenger/phone-format";
import { messagePreview, truncateQuote } from "@/lib/messenger/display";
import { refreshAppBadge } from "@/lib/messenger/app-badge";
import {
  ensureMessengerPushSubscription,
} from "@/lib/messenger/push";
import { getRoomUnread, subscribeUnreadChange, totalRoomUnread } from "@/lib/messenger/unread";
import type { LocalDialog } from "@/lib/messenger/types";
import { onAppResume } from "@/lib/platform/app-resume";
import { useMessengerUnlockOptional } from "../components/MessengerUnlockProvider";

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-sky-600 text-white text-[11px] font-semibold flex items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function DialogKindIcon({ kind }: { kind: LocalDialog["kind"] }) {
  if (kind === "room") {
    return (
      <span
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-500"
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a3 3 0 1 1 0 6a3 3 0 0 1 0-6M8 8a2.5 2.5 0 1 1 0 5a2.5 2.5 0 0 1 0-5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 18.5c.2-2.2 2.1-3.5 4.2-3.5c1.3 0 2.5.4 3.3 1.1M2 18.5c.3-2.1 2.2-3.5 4.5-3.5s4.2 1.4 4.5 3.5" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-500"
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 9.5h11M6.5 13h8M5.5 5h13A1.5 1.5 0 0 1 20 6.5v8A1.5 1.5 0 0 1 18.5 16H12l-4.3 3.1c-.5.4-1.2 0-1.2-.6V16h-1A1.5 1.5 0 0 1 4 14.5v-8A1.5 1.5 0 0 1 5.5 5Z" />
      </svg>
    </span>
  );
}

function formatDialogTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function dmPreview(summary: DmDialogsResponseItem | undefined): string {
  if (!summary) return "личный чат";
  const base =
    summary.lastMessageType === "image"
      ? "Фото"
      : summary.lastMessageType === "file"
        ? "Файл"
        : summary.lastMessageType === "audio"
          ? "Голосовое"
          : summary.lastMessageType === "video"
            ? "Видео"
            : "Сообщение";
  return summary.lastMessageFromMe ? `Вы: ${base}` : base;
}

export function MessengerHomeClient() {
  const router = useRouter();
  const unlock = useMessengerUnlockOptional();
  const [dialogs, setDialogs] = useState<LocalDialog[]>([]);
  const [phone, setPhone] = useState("");
  const [dmSummaries, setDmSummaries] = useState<Record<string, DmDialogsResponseItem>>({});
  const [localTextPreviewByChat, setLocalTextPreviewByChat] = useState<Record<string, string>>({});
  const [dmUnreadTotal, setDmUnreadTotal] = useState(0);
  const [roomUnreadTotal, setRoomUnreadTotal] = useState(0);
  const dialogsRef = useRef<LocalDialog[]>([]);
  dialogsRef.current = dialogs;

  function sortDialogsByPriority(
    list: LocalDialog[],
    summaryMap: Record<string, DmDialogsResponseItem>,
  ): LocalDialog[] {
    return [...list].sort((a, b) => {
      const aUnread = a.kind === "room" ? getRoomUnread(a.id) : (summaryMap[a.id]?.unreadCount ?? 0);
      const bUnread = b.kind === "room" ? getRoomUnread(b.id) : (summaryMap[b.id]?.unreadCount ?? 0);

      const aTs =
        a.kind === "dm"
          ? (summaryMap[a.id]?.latestUnreadAt ?? summaryMap[a.id]?.lastMessageAt ?? a.createdAt)
          : a.createdAt;
      const bTs =
        b.kind === "dm"
          ? (summaryMap[b.id]?.latestUnreadAt ?? summaryMap[b.id]?.lastMessageAt ?? b.createdAt)
          : b.createdAt;

      if (aUnread > 0 && bUnread === 0) return -1;
      if (bUnread > 0 && aUnread === 0) return 1;
      return bTs - aTs;
    });
  }

  async function refreshDialogsAndUnread(baseDialogs?: LocalDialog[]) {
    const localDialogs = baseDialogs ?? dialogsRef.current;
    const serverDm = await fetchDmDialogs();
    const summaryMap: Record<string, DmDialogsResponseItem> = {};
    for (const item of serverDm) summaryMap[item.chatId] = item;

    const mergedMap = new Map(localDialogs.map((d) => [d.id, d]));
    for (const item of serverDm) {
      mergedMap.set(item.chatId, {
        id: item.chatId,
        kind: "dm",
        title: item.label,
        peerPhone: item.peerPhone,
        displayName: item.displayName ?? undefined,
        createdAt: item.lastMessageAt || Date.now(),
      });
    }
    const merged = sortDialogsByPriority(Array.from(mergedMap.values()), summaryMap);
    setDialogs(merged);
    saveLocalDialogs(merged);

    setDmSummaries(summaryMap);
    const dmUnread = serverDm.reduce((sum, d) => sum + d.unreadCount, 0);
    setDmUnreadTotal(dmUnread);
    const roomUnread = totalRoomUnread();
    setRoomUnreadTotal(roomUnread);
    void refreshAppBadge(dmUnread);
  }

  useEffect(() => {
    const key = unlock?.storageKey;
    if (!key) {
      setLocalTextPreviewByChat({});
      return;
    }
    let cancelled = false;

    const dmDialogs = dialogs.filter((d) => d.kind === "dm").slice(0, 30);
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        dmDialogs.map(async (d) => {
          try {
            const history = await loadChatHistory(key, d.id);
            const last = history[history.length - 1];
            if (!last) return;
            const raw = messagePreview({ ...last.plain, type: last.type, mime: last.plain.mime });
            const text = truncateQuote(raw, 52);
            next[d.id] = last.mine ? `Вы: ${text}` : text;
          } catch {
            // ignore undecryptable/local failures
          }
        }),
      );
      if (!cancelled) {
        setLocalTextPreviewByChat(next);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dialogs, unlock?.storageKey]);

  useEffect(() => {
    let cancelled = false;

    void fetchAccessCheck(true).then(async (data) => {
      if (!data.messengerLoggedIn) {
        router.replace("/tools/messenger/login");
        return;
      }
      if (cancelled) return;
      setPhone(data.phone ?? "");
      void ensureDeviceKeyPublished().catch(() => {});
      void ensureMessengerPushSubscription();
      const synced = await syncRoomDialogs();
      if (cancelled) return;
      setDialogs(synced);
      void refreshDialogsAndUnread(synced);
    });
    const unsubUnread = subscribeUnreadChange(() => {
      void refreshDialogsAndUnread();
    });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshDialogsAndUnread();
      }
    }, 7000);
    const removeResume = onAppResume(() => {
      void refreshDialogsAndUnread();
    });
    return () => {
      cancelled = true;
      unsubUnread();
      clearInterval(timer);
      removeResume();
    };
  }, [router]);

  async function handleLogout() {
    await logoutMessenger();
    router.replace("/tools/messenger/login");
  }

  function dialogHref(d: LocalDialog): string {
    if (d.kind === "dm" && d.peerPhone) {
      return messengerChatUrl(d.peerPhone);
    }
    if (d.kind === "room" && d.roomId) {
      return messengerRoomUrl(d.roomId);
    }
    return "/tools/messenger/home";
  }

  function dialogUnread(d: LocalDialog): number {
    if (d.kind === "room") return getRoomUnread(d.id);
    return dmSummaries[d.id]?.unreadCount ?? 0;
  }

  return (
    <MessengerShell
      variant="app"
      title="Мессенджер"
      subtitle={phone ? maskPhone(phone) : undefined}
      backHref="/"
      trailing={
        <div className="flex items-center gap-2">
          <SettingsHeaderLink href="/tools/messenger/settings" />
          <button type="button" onClick={() => void handleLogout()} className="text-xs text-gray-500">
            Выйти
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-4 w-full">
        {(dmUnreadTotal + roomUnreadTotal) > 0 && (
          <p className="text-xs text-gray-500 text-center">
            Непрочитанных: {dmUnreadTotal + roomUnreadTotal}
          </p>
        )}
        <div className="grid gap-2">
          <Link
            href="/tools/messenger/contacts"
            className="rounded-2xl bg-gray-900 text-white py-3 text-center text-sm font-semibold"
          >
            Новый чат
          </Link>
          <Link
            href="/tools/messenger/room/create"
            className="rounded-2xl border border-gray-200 bg-white py-3 text-center text-sm font-semibold"
          >
            Создать комнату
          </Link>
          <Link
            href="/tools/messenger/room/join"
            className="rounded-2xl border border-gray-200 bg-white py-3 text-center text-sm font-semibold"
          >
            Присоединиться к комнате
          </Link>
        </div>

        {dialogs.length > 0 && (
          <section>
            <h2 className="text-xs font-mono uppercase tracking-wider text-gray-400 mb-2">
              Активные диалоги
            </h2>
            <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white overflow-hidden">
              {dialogs.map((d) => {
                const unread = dialogUnread(d);
                const dm = d.kind === "dm" ? dmSummaries[d.id] : undefined;
                const infoTs =
                  d.kind === "dm"
                    ? (dm?.latestUnreadAt ?? dm?.lastMessageAt ?? d.createdAt)
                    : d.createdAt;
                return (
                  <li key={d.id}>
                    <Link
                      href={dialogHref(d)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                    >
                      <DialogKindIcon kind={d.kind} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm truncate ${unread > 0 ? "font-semibold text-gray-900" : "font-medium"}`}>
                            {d.title}
                          </p>
                          <span className="text-[10px] text-gray-400 shrink-0">{formatDialogTime(infoTs)}</span>
                        </div>
                        <p className={`text-xs truncate ${unread > 0 ? "text-gray-700" : "text-gray-400"}`}>
                          {d.kind === "room"
                            ? "комната"
                            : `${localTextPreviewByChat[d.id] ?? dmPreview(dm)}${dm?.peerOnline ? " · в сети" : ""}`}
                        </p>
                      </div>
                      <UnreadBadge count={unread} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </MessengerShell>
  );
}
