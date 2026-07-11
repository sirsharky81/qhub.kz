"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { messengerRoomUrl } from "@/lib/app-routes";
import {
  fetchAccessCheck,
  fetchProfilesInfoMap,
  fetchRoomManage,
  leaveRoomApi,
  type RoomManageSnapshot,
} from "@/lib/messenger/client";
import { cleanupRoomLocalState } from "@/lib/messenger/dialogs";
import { peerDisplayLabel } from "@/lib/messenger/phone-format";
import { ChatInfoView } from "../../components/ChatInfoView";
import { MessengerShell } from "../../components/MessengerShell";

function MessengerRoomInfoInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = useMemo(
    () => String(searchParams.get("id") ?? "").toUpperCase(),
    [searchParams],
  );
  const backHref = messengerRoomUrl(roomId);

  const [myPhone, setMyPhone] = useState("");
  const [snapshot, setSnapshot] = useState<RoomManageSnapshot | null>(null);
  const [profileMap, setProfileMap] = useState<
    Record<string, { label: string; displayName: string | null; avatarUrl: string | null }>
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) {
      router.replace("/tools/messenger/home");
      return;
    }
    let cancelled = false;
    void (async () => {
      const access = await fetchAccessCheck();
      if (!access.messengerLoggedIn || !access.phone) {
        router.replace("/tools/messenger/login");
        return;
      }
      if (cancelled) return;
      setMyPhone(access.phone);
      try {
        const [manage, profiles] = await Promise.all([
          fetchRoomManage(roomId),
          fetchProfilesInfoMap(),
        ]);
        if (cancelled) return;
        setSnapshot(manage);
        setProfileMap(profiles);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, router]);

  if (!roomId) return null;

  if (loading || !myPhone) {
    return (
      <MessengerShell variant="app" title="О комнате" backHref={backHref}>
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Загрузка…</div>
      </MessengerShell>
    );
  }

  const title = snapshot?.name?.trim() || `Комната ${roomId}`;
  const canManage = snapshot?.actorRole === "owner" || snapshot?.actorRole === "admin";
  const participants = (snapshot?.participants ?? []).map((p) => ({
    phone: p.phone,
    label: peerDisplayLabel(p.phone, profileMap[p.phone]?.displayName),
    role: p.role,
    online: p.online,
    avatarUrl: profileMap[p.phone]?.avatarUrl ?? null,
  }));

  return (
    <ChatInfoView
      kind="room"
      title={title}
      subtitle={`Код ${roomId}`}
      avatarUrl={snapshot?.avatarUrl ?? null}
      channel={`room:${roomId}`}
      backHref={backHref}
      seed={roomId}
      participants={participants}
      adminHref={canManage ? `/tools/messenger/room/settings?id=${encodeURIComponent(roomId)}` : null}
      onLeaveRoom={async () => {
        if (participants.length > 1 && !window.confirm("Покинуть комнату?")) return;
        await leaveRoomApi(roomId);
        await cleanupRoomLocalState(roomId);
        router.replace("/tools/messenger/home");
      }}
    />
  );
}

export function MessengerRoomInfoClient() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center text-sm text-gray-500">
          Загрузка…
        </div>
      }
    >
      <MessengerRoomInfoInner />
    </Suspense>
  );
}
