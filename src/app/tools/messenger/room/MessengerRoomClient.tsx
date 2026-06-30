"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ChatView } from "../components/ChatView";
import { PinUnlockGate } from "../components/PinUnlockGate";
import {
  fetchAccessCheck,
  fetchProfilesMap,
  fetchRoomStatus,
  joinRoomApi,
  leaveRoomApi,
} from "@/lib/messenger/client";
import { importRoomKeyBase64Url } from "@/lib/messenger/crypto";
import { cleanupRoomLocalState, upsertLocalDialog } from "@/lib/messenger/dialogs";
import { maskPhone } from "@/lib/messenger/phone-format";
import { getRoomKey } from "@/lib/messenger/room-keys";

function MessengerRoomInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = String(searchParams.get("id") ?? "").toUpperCase();
  const [myPhone, setMyPhone] = useState("");
  const [aesKey, setAesKey] = useState<CryptoKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLabels, setProfileLabels] = useState<Record<string, string>>({});

  const handleRoomEnded = useCallback(() => {
    void cleanupRoomLocalState(roomId).then(() => {
      router.replace("/tools/messenger/home");
    });
  }, [roomId, router]);

  const handleLeaveRoom = useCallback(
    async (participantCount: number) => {
      if (participantCount > 1 && !window.confirm("Покинуть комнату?")) return;
      await leaveRoomApi(roomId);
      await cleanupRoomLocalState(roomId);
      router.replace("/tools/messenger/home");
    },
    [roomId, router],
  );

  useEffect(() => {
    if (!roomId) {
      router.replace("/tools/messenger/home");
      return;
    }
    let cancelled = false;

    async function init() {
      const access = await fetchAccessCheck();
      if (!access.messengerLoggedIn) {
        router.replace("/tools/messenger/login");
        return;
      }
      if (!cancelled) setMyPhone(access.phone ?? "");

      const storedKey = getRoomKey(roomId);
      if (!storedKey) {
        router.replace(`/tools/messenger/room/join?code=${encodeURIComponent(roomId)}`);
        return;
      }

      const status = await fetchRoomStatus(roomId);
      if (!status) {
        await cleanupRoomLocalState(roomId);
        if (!cancelled) {
          setError("Комната завершена");
          setLoading(false);
        }
        return;
      }

      try {
        const key = await importRoomKeyBase64Url(storedKey);
        const joined = await joinRoomApi(roomId);
        if (!joined.ok) {
          if (!cancelled) {
            setError(joined.error ?? "Не удалось войти в комнату");
            setLoading(false);
          }
          return;
        }
        upsertLocalDialog({
          id: `room:${roomId}`,
          kind: "room",
          title: `Комната ${roomId}`,
          roomId,
          createdAt: Date.now(),
        });
        const profiles = await fetchProfilesMap();
        if (!cancelled) {
          setProfileLabels(profiles);
          setAesKey(key);
          setLoading(false);
        }
      } catch {
        await cleanupRoomLocalState(roomId);
        if (!cancelled) {
          setError("Неверный ключ комнаты");
          setLoading(false);
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [roomId, router]);

  if (error) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-sm text-gray-600">{error}</p>
        <Link
          href="/tools/messenger/home"
          className="rounded-2xl bg-gray-900 text-white px-6 py-2.5 text-sm font-semibold"
        >
          На главную
        </Link>
      </div>
    );
  }

  if (loading || !aesKey || !myPhone) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-sm text-gray-500">
        Вход в комнату…
      </div>
    );
  }

  return (
    <PinUnlockGate
      phone={myPhone}
      maskedPhone={maskPhone(myPhone)}
      title={`Комната ${roomId}`}
      backHref="/tools/messenger/home"
    >
      <ChatView
        channel={`room:${roomId}`}
        title={`Комната ${roomId}`}
        backHref="/tools/messenger/home"
        myPhone={myPhone}
        aesKey={aesKey}
        isRoom
        roomId={roomId}
        onLeaveRoom={handleLeaveRoom}
        onRoomEnded={handleRoomEnded}
        profileLabels={profileLabels}
      />
    </PinUnlockGate>
  );
}

export function MessengerRoomClient() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center text-sm text-gray-500">Загрузка…</div>}>
      <MessengerRoomInner />
    </Suspense>
  );
}
