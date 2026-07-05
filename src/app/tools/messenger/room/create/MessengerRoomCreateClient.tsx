"use client";

import { messengerRoomUrl } from "@/lib/app-routes";
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

const ROOM_STEP_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function MessengerRoomCreateClient() {
  const router = useRouter();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomKey, setRoomKeyState] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        if (!cancelled) setError(null);
        const key = await generateRoomAesKey();
        const keyB64 = await exportRoomKeyBase64Url(key);
        const created = await withTimeout(
          createRoom(),
          ROOM_STEP_TIMEOUT_MS,
          "Таймаут создания комнаты",
        );
        if (!created) {
          if (!cancelled) setError("Не удалось создать комнату. Попробуйте снова.");
          return;
        }
        if (cancelled) return;
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
      } catch {
        if (!cancelled) setError("Ошибка создания комнаты. Проверьте интернет и повторите.");
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  useEffect(() => {
    void fetch("/api/messenger/access-check")
      .then((r) => r.json())
      .then((d: { messengerLoggedIn?: boolean }) => {
        if (!d.messengerLoggedIn) router.replace("/tools/messenger/login");
      });
  }, [router]);

  if (!roomId || !roomKey) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 text-sm text-gray-500">
        <p>Создание комнаты…</p>
        {error && <p className="text-red-600 text-center px-4">{error}</p>}
        {error && (
          <button
            type="button"
            onClick={() => setRetryKey((v) => v + 1)}
            className="rounded-2xl bg-sky-600 text-white px-5 py-2 text-sm font-semibold"
          >
            Повторить
          </button>
        )}
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
            setError(null);
            void withTimeout(joinRoomApi(roomId), ROOM_STEP_TIMEOUT_MS, "Таймаут входа в комнату")
              .then((r) => {
                if (r.ok) {
                  router.replace(messengerRoomUrl(roomId));
                } else {
                  setError(r.error ?? "Не удалось войти в комнату");
                  setEntering(false);
                }
              })
              .catch(() => {
                setError("Ошибка сети при входе в комнату");
                setEntering(false);
              });
          }}
          className="w-full max-w-xs mx-auto block rounded-2xl bg-sky-600 text-white py-3 text-sm font-semibold disabled:opacity-50"
        >
          {entering ? "Вход…" : "Войти в чат"}
        </button>
        {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
      </div>
    </MessengerShell>
  );
}
