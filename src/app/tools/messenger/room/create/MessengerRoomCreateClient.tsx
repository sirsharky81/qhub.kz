"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RoomInvite } from "../../components/RoomInvite";
import { MessengerShell } from "../../components/MessengerShell";
import { createRoom, joinRoomApi } from "@/lib/messenger/client";
import {
  exportRoomKeyBase64Url,
  generateRoomAesKey,
} from "@/lib/messenger/crypto";
import { upsertLocalDialog } from "@/lib/messenger/dialogs";
import { setRoomKey } from "@/lib/messenger/room-keys";

export function MessengerRoomCreateClient() {
  const router = useRouter();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomKey, setRoomKeyState] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const key = await generateRoomAesKey();
      const keyB64 = await exportRoomKeyBase64Url(key);
      const created = await createRoom();
      if (!created || cancelled) return;
      setRoomId(created.roomId);
      setRoomKeyState(keyB64);
      setRoomKey(created.roomId, keyB64);
      upsertLocalDialog({
        id: created.channel,
        kind: "room",
        title: `Комната ${created.roomId}`,
        roomId: created.roomId,
        createdAt: Date.now(),
      });
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void fetch("/api/messenger/access-check")
      .then((r) => r.json())
      .then((d: { messengerLoggedIn?: boolean }) => {
        if (!d.messengerLoggedIn) router.replace("/tools/messenger/login");
      });
  }, [router]);

  if (!roomId || !roomKey) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-sm text-gray-500">
        Создание комнаты…
      </div>
    );
  }

  return (
    <MessengerShell variant="app" title="Комната создана" backHref="/tools/messenger/home">
      <RoomInvite roomId={roomId} roomKey={roomKey} />
      <div className="px-4 pb-6">
        <button
          type="button"
          disabled={entering}
          onClick={() => {
            setEntering(true);
            void joinRoomApi(roomId).then((r) => {
              if (r.ok) {
                router.replace(`/tools/messenger/room/${roomId}`);
              } else {
                setEntering(false);
              }
            });
          }}
          className="w-full max-w-xs mx-auto block rounded-2xl bg-sky-600 text-white py-3 text-sm font-semibold disabled:opacity-50"
        >
          {entering ? "Вход…" : "Войти в чат"}
        </button>
      </div>
    </MessengerShell>
  );
}
