"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MessengerShell } from "../components/MessengerShell";
import { fetchAccessCheck, logoutMessenger } from "@/lib/messenger/client";
import { ensureDeviceKeyPublished } from "@/lib/messenger/device-keys";
import { syncRoomDialogs } from "@/lib/messenger/dialogs";
import { maskPhone } from "@/lib/messenger/phone-format";
import type { LocalDialog } from "@/lib/messenger/types";

export function MessengerHomeClient() {
  const router = useRouter();
  const [dialogs, setDialogs] = useState<LocalDialog[]>([]);
  const [phone, setPhone] = useState("");

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

  return (
    <MessengerShell
      variant="app"
      title="Мессенджер"
      subtitle={phone ? maskPhone(phone) : undefined}
      backHref="/"
      trailing={
        <button type="button" onClick={() => void handleLogout()} className="text-xs text-gray-500">
          Выйти
        </button>
      }
    >
      <div className="p-4 space-y-4 w-full">
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
              {dialogs.map((d) => (
                <li key={d.id}>
                  <Link
                    href={dialogHref(d)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                  >
                    <span className="text-xl">{d.kind === "room" ? "👥" : "💬"}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{d.title}</p>
                      <p className="text-xs text-gray-400">
                        {d.kind === "room" ? "комната" : "личный чат"}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </MessengerShell>
  );
}
