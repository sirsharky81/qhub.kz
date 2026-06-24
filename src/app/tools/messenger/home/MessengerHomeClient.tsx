"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SettingsHeaderLink } from "@/components/SettingsHeaderButton";
import { MessengerShell } from "../components/MessengerShell";
import { fetchAccessCheck, logoutMessenger } from "@/lib/messenger/client";
import { ensureDeviceKeyPublished } from "@/lib/messenger/device-keys";
import { syncRoomDialogs } from "@/lib/messenger/dialogs";
import { countAllUnreadDm, countUnreadInChat } from "@/lib/messenger/history-db";
import { maskPhone } from "@/lib/messenger/phone-format";
import { refreshAppBadge } from "@/lib/messenger/app-badge";
import { getRoomUnread, subscribeUnreadChange, totalRoomUnread } from "@/lib/messenger/unread";
import type { LocalDialog } from "@/lib/messenger/types";

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-sky-600 text-white text-[11px] font-semibold flex items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function MessengerHomeClient() {
  const router = useRouter();
  const [dialogs, setDialogs] = useState<LocalDialog[]>([]);
  const [phone, setPhone] = useState("");
  const [dmUnread, setDmUnread] = useState(0);
  const [roomUnreadTotal, setRoomUnreadTotal] = useState(0);
  const [dmUnreadByChat, setDmUnreadByChat] = useState<Record<string, number>>({});

  async function refreshUnread(dialogList: LocalDialog[] = dialogs) {
    const dm = await countAllUnreadDm().catch(() => 0);
    setDmUnread(dm);
    setRoomUnreadTotal(totalRoomUnread());
    const dmMap: Record<string, number> = {};
    await Promise.all(
      dialogList
        .filter((d) => d.kind === "dm")
        .map(async (d) => {
          dmMap[d.id] = await countUnreadInChat(d.id).catch(() => 0);
        }),
    );
    setDmUnreadByChat(dmMap);
    void refreshAppBadge(dm);
  }

  useEffect(() => {
    void fetchAccessCheck(true).then(async (data) => {
      if (!data.messengerLoggedIn) {
        router.replace("/tools/messenger/login");
        return;
      }
      setPhone(data.phone ?? "");
      void ensureDeviceKeyPublished().catch(() => {});
      const synced = await syncRoomDialogs();
      setDialogs(synced);
      void refreshUnread(synced);
    });
    return subscribeUnreadChange(() => {
      void refreshUnread();
    });
  }, [router]);

  async function handleLogout() {
    await logoutMessenger();
    router.replace("/tools/messenger/login");
  }

  function dialogHref(d: LocalDialog): string {
    if (d.kind === "dm" && d.peerPhone) {
      return `/tools/messenger/chat/${encodeURIComponent(d.peerPhone)}`;
    }
    if (d.kind === "room" && d.roomId) {
      return `/tools/messenger/room/${d.roomId}`;
    }
    return "/tools/messenger/home";
  }

  function dialogUnread(d: LocalDialog): number {
    if (d.kind === "room") return getRoomUnread(d.id);
    return dmUnreadByChat[d.id] ?? 0;
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
        {(dmUnread + roomUnreadTotal) > 0 && (
          <p className="text-xs text-gray-500 text-center">
            Непрочитанных: {dmUnread + roomUnreadTotal}
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
                return (
                  <li key={d.id}>
                    <Link
                      href={dialogHref(d)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                    >
                      <span className="text-xl">{d.kind === "room" ? "👥" : "💬"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{d.title}</p>
                        <p className="text-xs text-gray-400">
                          {d.kind === "room" ? "комната" : "личный чат"}
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
