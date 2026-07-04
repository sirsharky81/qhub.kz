"use client";

import Link from "next/link";
import { messengerChatUrl, messengerRoomUrl } from "@/lib/app-routes";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SettingsHeaderLink } from "@/components/SettingsHeaderButton";
import { MessengerShell } from "../components/MessengerShell";
import {
  fetchAccessCheck,
  fetchDmDialogs,
  logoutMessenger,
  reorderPinnedDialogs,
  type DmDialogsResponseItem,
  updateDialogPrefs,
} from "@/lib/messenger/client";
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
import { MESSENGER_MAX_PINNED_DIALOGS } from "@/lib/messenger/constants";
import type { DialogPrefs, LocalDialog } from "@/lib/messenger/types";
import { onAppResume } from "@/lib/platform/app-resume";
import { useMessengerUnlockOptional } from "../components/MessengerUnlockProvider";

const LONG_PRESS_MS = 450;

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
  type DialogTab = "active" | "archived";
  const router = useRouter();
  const unlock = useMessengerUnlockOptional();
  const [dialogs, setDialogs] = useState<LocalDialog[]>([]);
  const [phone, setPhone] = useState("");
  const [dmSummaries, setDmSummaries] = useState<Record<string, DmDialogsResponseItem>>({});
  const [localTextPreviewByChat, setLocalTextPreviewByChat] = useState<Record<string, string>>({});
  const [dialogPrefsMap, setDialogPrefsMap] = useState<Record<string, DialogPrefs>>({});
  const [dialogTab, setDialogTab] = useState<DialogTab>("active");
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [longPressDialogId, setLongPressDialogId] = useState<string | null>(null);
  const [dmUnreadTotal, setDmUnreadTotal] = useState(0);
  const [roomUnreadTotal, setRoomUnreadTotal] = useState(0);
  const dialogsRef = useRef<LocalDialog[]>([]);
  const longPressTimerRef = useRef<number | null>(null);
  const suppressLinkClickRef = useRef(false);
  dialogsRef.current = dialogs;

  function sortDialogsByPriority(
    list: LocalDialog[],
    summaryMap: Record<string, DmDialogsResponseItem>,
    prefsMap: Record<string, DialogPrefs>,
  ): LocalDialog[] {
    const prefsFor = (dialog: LocalDialog): DialogPrefs => {
      if (dialog.kind === "dm") {
        const dm = summaryMap[dialog.id];
        return {
          pinnedAt: dm?.pinnedAt ?? prefsMap[dialog.id]?.pinnedAt ?? null,
          pinOrder: dm?.pinOrder ?? prefsMap[dialog.id]?.pinOrder ?? null,
          archivedAt: dm?.archivedAt ?? prefsMap[dialog.id]?.archivedAt ?? null,
        };
      }
      return prefsMap[dialog.id] ?? { pinnedAt: null, pinOrder: null, archivedAt: null };
    };

    return [...list].sort((a, b) => {
      const aPrefs = prefsFor(a);
      const bPrefs = prefsFor(b);
      const aPinned = aPrefs.pinnedAt ?? 0;
      const bPinned = bPrefs.pinnedAt ?? 0;
      if (aPinned > 0 && bPinned === 0) return -1;
      if (bPinned > 0 && aPinned === 0) return 1;
      if (aPinned > 0 && bPinned > 0) {
        const aOrder = aPrefs.pinOrder ?? Number.MAX_SAFE_INTEGER;
        const bOrder = bPrefs.pinOrder ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
      }
      if (aPinned !== bPinned) return bPinned - aPinned;

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
    const { dialogs: serverDm, dialogPrefs } = await fetchDmDialogs();
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
    const merged = sortDialogsByPriority(Array.from(mergedMap.values()), summaryMap, dialogPrefs);
    setDialogs(merged);
    saveLocalDialogs(merged);

    setDmSummaries(summaryMap);
    setDialogPrefsMap(dialogPrefs);
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
    const onFocus = () => {
      void refreshDialogsAndUnread();
    };
    const onPageShow = () => {
      void refreshDialogsAndUnread();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshDialogsAndUnread();
      }
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    const removeResume = onAppResume(() => {
      void refreshDialogsAndUnread();
    });
    return () => {
      cancelled = true;
      unsubUnread();
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      removeResume();
    };
  }, [router]);

  useEffect(
    () => () => {
      clearLongPressTimer();
    },
    [],
  );

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

  function dialogPrefsFor(d: LocalDialog): DialogPrefs {
    if (d.kind === "dm") {
      const dm = dmSummaries[d.id];
      return {
        pinnedAt: dm?.pinnedAt ?? dialogPrefsMap[d.id]?.pinnedAt ?? null,
        pinOrder: dm?.pinOrder ?? dialogPrefsMap[d.id]?.pinOrder ?? null,
        archivedAt: dm?.archivedAt ?? dialogPrefsMap[d.id]?.archivedAt ?? null,
      };
    }
    return dialogPrefsMap[d.id] ?? { pinnedAt: null, pinOrder: null, archivedAt: null };
  }

  const visibleDialogs = dialogs.filter((d) => {
    const archived = (dialogPrefsFor(d).archivedAt ?? 0) > 0;
    return dialogTab === "archived" ? archived : !archived;
  });
  const pinnedActiveDialogs = dialogs.filter((d) => {
    const prefs = dialogPrefsFor(d);
    return (prefs.pinnedAt ?? 0) > 0 && (prefs.archivedAt ?? 0) <= 0;
  });
  const longPressDialog = longPressDialogId ? dialogs.find((d) => d.id === longPressDialogId) ?? null : null;

  async function handleTogglePin(dialog: LocalDialog) {
    setPrefsError(null);
    const prefs = dialogPrefsFor(dialog);
    const nextPinned = !(prefs.pinnedAt && prefs.pinnedAt > 0);
    if (nextPinned && pinnedActiveDialogs.length >= MESSENGER_MAX_PINNED_DIALOGS) {
      setPrefsError(`Можно закрепить не более ${MESSENGER_MAX_PINNED_DIALOGS} диалогов`);
      return;
    }
    const result = await updateDialogPrefs({ dialogId: dialog.id, pinned: nextPinned });
    if (!result.ok) {
      setPrefsError(result.error ?? "Не удалось обновить закрепление");
      return;
    }
    await refreshDialogsAndUnread();
  }

  async function handleToggleArchive(dialog: LocalDialog) {
    setPrefsError(null);
    const prefs = dialogPrefsFor(dialog);
    const nextArchived = !(prefs.archivedAt && prefs.archivedAt > 0);
    const result = await updateDialogPrefs({
      dialogId: dialog.id,
      archived: nextArchived,
      pinned: nextArchived ? false : undefined,
    });
    if (!result.ok) {
      setPrefsError(result.error ?? "Не удалось обновить архив");
      return;
    }
    await refreshDialogsAndUnread();
  }

  async function handleMovePinned(dialog: LocalDialog, direction: "up" | "down") {
    setPrefsError(null);
    const ordered = [...pinnedActiveDialogs];
    const index = ordered.findIndex((d) => d.id === dialog.id);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;
    const [item] = ordered.splice(index, 1);
    ordered.splice(targetIndex, 0, item);
    const ok = await reorderPinnedDialogs(ordered.map((d) => d.id));
    if (!ok) {
      setPrefsError("Не удалось изменить порядок закреплённых");
      return;
    }
    await refreshDialogsAndUnread();
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function startLongPress(dialog: LocalDialog) {
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      suppressLinkClickRef.current = true;
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate(10);
        } catch {
          // vibration is optional UX enhancement
        }
      }
      setLongPressDialogId(dialog.id);
    }, LONG_PRESS_MS);
  }

  function endLongPress() {
    clearLongPressTimer();
  }

  function closeLongPressMenu() {
    suppressLinkClickRef.current = false;
    setLongPressDialogId(null);
  }

  async function runFromLongPress(action: () => Promise<void>) {
    await action();
    closeLongPressMenu();
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
        {prefsError && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {prefsError}
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
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-mono uppercase tracking-wider text-gray-400">
                  {dialogTab === "active" ? "Активные диалоги" : "Архив"}
                </h2>
                {dialogTab === "active" && (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      pinnedActiveDialogs.length >= MESSENGER_MAX_PINNED_DIALOGS
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-gray-200 bg-gray-50 text-gray-500"
                    }`}
                  >
                    Pin {pinnedActiveDialogs.length}/{MESSENGER_MAX_PINNED_DIALOGS}
                  </span>
                )}
              </div>
              <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setDialogTab("active")}
                  className={`px-2.5 py-1 rounded-lg ${dialogTab === "active" ? "bg-gray-900 text-white" : "text-gray-600"}`}
                >
                  Активные
                </button>
                <button
                  type="button"
                  onClick={() => setDialogTab("archived")}
                  className={`px-2.5 py-1 rounded-lg ${dialogTab === "archived" ? "bg-gray-900 text-white" : "text-gray-600"}`}
                >
                  Архив
                </button>
              </div>
            </div>
            <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white overflow-hidden">
              {visibleDialogs.map((d) => {
                const unread = dialogUnread(d);
                const dm = d.kind === "dm" ? dmSummaries[d.id] : undefined;
                const prefs = dialogPrefsFor(d);
                const pinned = (prefs.pinnedAt ?? 0) > 0;
                const pinnedIndex = pinnedActiveDialogs.findIndex((x) => x.id === d.id);
                const infoTs =
                  d.kind === "dm"
                    ? (dm?.latestUnreadAt ?? dm?.lastMessageAt ?? d.createdAt)
                    : d.createdAt;
                return (
                  <li key={d.id}>
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50"
                      onTouchStart={() => startLongPress(d)}
                      onTouchEnd={endLongPress}
                      onTouchCancel={endLongPress}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setLongPressDialogId(d.id);
                      }}
                    >
                      <Link
                        href={dialogHref(d)}
                        className="flex min-w-0 flex-1 items-center gap-3"
                        onClick={(e) => {
                          if (suppressLinkClickRef.current) {
                            e.preventDefault();
                            suppressLinkClickRef.current = false;
                          }
                        }}
                      >
                        <DialogKindIcon kind={d.kind} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm truncate ${unread > 0 ? "font-semibold text-gray-900" : "font-medium"}`}>
                              {pinned ? "PIN " : ""}
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
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleTogglePin(d)}
                          className={`rounded-lg px-2 py-1 text-[11px] ${pinned ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}
                          title={pinned ? "Открепить" : "Закрепить"}
                        >
                          Pin
                        </button>
                        {dialogTab === "active" && pinned && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleMovePinned(d, "up")}
                              className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] text-gray-600 disabled:opacity-40"
                              disabled={pinnedIndex <= 0}
                              title="Выше"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleMovePinned(d, "down")}
                              className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] text-gray-600 disabled:opacity-40"
                              disabled={pinnedIndex < 0 || pinnedIndex >= pinnedActiveDialogs.length - 1}
                              title="Ниже"
                            >
                              ↓
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleToggleArchive(d)}
                          className="rounded-lg bg-gray-100 px-2 py-1 text-[11px] text-gray-600"
                          title={dialogTab === "archived" ? "Вернуть в активные" : "В архив"}
                        >
                          {dialogTab === "archived" ? "Вернуть" : "Архив"}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
              {visibleDialogs.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-gray-400">
                  {dialogTab === "archived" ? "Архив пуст" : "Нет активных диалогов"}
                </li>
              )}
            </ul>
          </section>
        )}
        {longPressDialog && (
          <div
            className="fixed inset-0 z-50 bg-black/30"
            onClick={closeLongPressMenu}
            role="button"
            tabIndex={-1}
            aria-label="Закрыть меню"
          >
            <div
              className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="mb-3 text-sm font-semibold text-gray-900 truncate">{longPressDialog.title}</p>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => void runFromLongPress(() => handleTogglePin(longPressDialog))}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700"
                >
                  {(dialogPrefsFor(longPressDialog).pinnedAt ?? 0) > 0 ? "Открепить" : "Закрепить"}
                </button>
                {dialogTab === "active" && (dialogPrefsFor(longPressDialog).pinnedAt ?? 0) > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void runFromLongPress(() => handleMovePinned(longPressDialog, "up"))}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700"
                    >
                      Выше
                    </button>
                    <button
                      type="button"
                      onClick={() => void runFromLongPress(() => handleMovePinned(longPressDialog, "down"))}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700"
                    >
                      Ниже
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void runFromLongPress(() => handleToggleArchive(longPressDialog))}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700"
                >
                  {dialogTab === "archived" ? "Вернуть в активные" : "В архив"}
                </button>
                <button
                  type="button"
                  onClick={closeLongPressMenu}
                  className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MessengerShell>
  );
}
