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
import { maskPhone } from "@/lib/messenger/phone-format";
import { refreshAppBadge } from "@/lib/messenger/app-badge";
import {
  ensureMessengerPushSubscription,
} from "@/lib/messenger/push";
import { getRoomUnread, subscribeUnreadChange, totalRoomUnread } from "@/lib/messenger/unread";
import type { LocalDialog } from "@/lib/messenger/types";
import { onAppResume } from "@/lib/platform/app-resume";

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-sky-600 text-white text-[11px] font-semibold flex items-center justify-center">
      {count > 99 ? "99+" : count}
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
  const [dialogs, setDialogs] = useState<LocalDialog[]>([]);
  const [phone, setPhone] = useState("");
  const [dmSummaries, setDmSummaries] = useState<Record<string, DmDialogsResponseItem>>({});
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
                      <span className="text-xl">{d.kind === "room" ? "👥" : "💬"}</span>
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
                            : `${dmPreview(dm)}${dm?.peerOnline ? " · в сети" : ""}`}
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
