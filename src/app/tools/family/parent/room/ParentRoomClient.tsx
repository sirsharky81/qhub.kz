"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { FamilyShell } from "../../components/FamilyShell";
import { MiniMap } from "../../components/MiniMap";
import { ChildrenList } from "../../components/ChildrenList";
import { ParentsList } from "../../components/ParentsList";
import { ShareLocationPanel } from "../../components/ShareLocationPanel";
import { SosPhoneSettings } from "../../components/SosPhoneSettings";
import { POLL_HIDDEN_MS, POLL_VISIBLE_MS } from "@/lib/family/constants";
import {
  clearSosApi,
  deleteFamilyRoomApi,
  leaveFamilyApi,
  pollFamilyRoomApi,
  postLocationApi,
  removeMemberApi,
  setShareLocationApi,
} from "@/lib/family/client";
import { cacheMemberCoords } from "@/lib/family/coords-db";
import { startGeoWatch } from "@/lib/family/geo";
import { sendSosToMessengerRoom } from "@/lib/family/messenger-sos";
import { subscribeFamilyPush } from "@/lib/family/push";
import { clearParentSession, clearAllFamilyLocalData, loadParentSession } from "@/lib/family/session";
import { messengerChatUrl, parentMapMemberUrl, parentMapUrl, parentRoomUrl } from "@/lib/app-routes";
import { SettingsHeaderButton } from "@/components/SettingsHeaderButton";
import type { FamilyPollSnapshot, FamilySession } from "@/lib/family/types";

function ParentRoomInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams.get("id") ?? "";
  const [session, setSession] = useState<FamilySession | null>(null);
  const [snapshot, setSnapshot] = useState<FamilyPollSnapshot | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>();
  const [shareWithChildren, setShareWithChildren] = useState(false);
  const [shareWithParents, setShareWithParents] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const versionRef = useRef(0);
  const lastSosRef = useRef<Record<string, number>>({});

  const isOwner = session?.role === "owner";

  useEffect(() => {
    if (!roomId) {
      router.replace("/tools/family/parent");
      return;
    }
    const s = loadParentSession();
    if (!s || s.roomId.toUpperCase() !== roomId.toUpperCase()) {
      router.replace("/tools/family/parent");
      return;
    }
    setSession(s);
    void subscribeFamilyPush(s);
  }, [roomId, router]);

  const poll = useCallback(async () => {
    const s = loadParentSession();
    if (!s) return;
    const result = await pollFamilyRoomApi(s, versionRef.current, true);
    if (!result) return;
    if ("error" in result && result.error === "room_gone") {
      clearAllFamilyLocalData();
      router.replace("/tools/family");
      return;
    }
    if ("snapshot" in result && result.snapshot.members) {
      setSnapshot(result.snapshot);
      versionRef.current = result.version;
      for (const loc of result.snapshot.locations) {
        await cacheMemberCoords(loc);
      }
      const messengerRoomId = result.snapshot.room.messengerRoomId;
      if (messengerRoomId) {
        for (const sosItem of result.snapshot.sos) {
          if (!sosItem.active) continue;
          const prev = lastSosRef.current[sosItem.memberId] ?? 0;
          if (sosItem.startedAt <= prev) continue;
          lastSosRef.current[sosItem.memberId] = sosItem.startedAt;
          const child = result.snapshot.members.find((m) => m.memberId === sosItem.memberId);
          void sendSosToMessengerRoom({
            messengerRoomId,
            memberName: child?.name ?? "Участник",
            lat: sosItem.lat,
            lng: sosItem.lng,
            familyRoomId: s.roomId,
          });
        }
      }
    }
  }, [router]);

  useEffect(() => {
    if (!session) return;
    void poll();
    let cancelled = false;
    const loop = async () => {
      while (!cancelled) {
        await poll();
        const ms = document.hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS;
        await new Promise((r) => setTimeout(r, ms));
      }
    };
    void loop();
    return () => {
      cancelled = true;
    };
  }, [session, poll]);

  const selfParent = snapshot?.parents.find((p) => p.memberId === session?.memberId);
  useEffect(() => {
    if (selfParent) {
      setShareWithChildren(selfParent.shareLocationWithChildren);
      setShareWithParents(selfParent.shareLocationWithParents);
    }
  }, [selfParent?.shareLocationWithChildren, selfParent?.shareLocationWithParents]);

  const sharingActive = shareWithChildren || shareWithParents;
  useEffect(() => {
    if (!sharingActive || !session) return;
    const stop = startGeoWatch((pos) => {
      void postLocationApi(session, {
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
      }).catch(() => {});
    });
    return stop;
  }, [sharingActive, session]);

  const children = (snapshot?.members ?? []).filter((m) => m.role === "tracked");
  const parents = snapshot?.parents ?? [];
  const hasOtherParent = parents.length > 1;
  const locations = snapshot?.locations ?? [];
  const sos = snapshot?.sos ?? [];
  const mapMembers = [
    ...children,
    ...parents
      .filter((p) => p.memberId !== session?.memberId && p.shareLocationWithParents)
      .map((p) => ({ memberId: p.memberId, role: "observer" as const, name: p.name })),
  ];
  const parentMemberIds = parents.map((p) => p.memberId);
  const returnTo = parentRoomUrl(roomId);
  const childMessageHrefs = new Map(
    children.flatMap((m) =>
      m.messengerPeerPhone ? [[m.memberId, messengerChatUrl(m.messengerPeerPhone, returnTo)] as const] : [],
    ),
  );

  async function handleShareToggle(target: "children" | "parents", enabled: boolean) {
    const s = loadParentSession();
    if (!s) return;
    setShareLoading(true);
    try {
      await setShareLocationApi(s, enabled, target);
      if (target === "children") setShareWithChildren(enabled);
      else setShareWithParents(enabled);
      await poll();
    } finally {
      setShareLoading(false);
    }
  }

  async function handleRemoveParticipant(memberId: string) {
    const s = loadParentSession();
    if (!s || !isOwner || !confirm("Удалить участника из семьи?")) return;
    await removeMemberApi(s, memberId);
    if (selectedChildId === memberId) setSelectedChildId(undefined);
    await poll();
  }

  async function handleRemoveParent(memberId: string) {
    const s = loadParentSession();
    if (!s || !isOwner || !confirm("Удалить родителя из семьи?")) return;
    await removeMemberApi(s, memberId);
    await poll();
  }

  async function handleClearSos(memberId: string) {
    const s = loadParentSession();
    if (!s) return;
    await clearSosApi(s, memberId);
    await poll();
  }

  async function handleDeleteRoom() {
    const s = loadParentSession();
    if (!s || !confirm("Удалить семью и все данные? Это действие нельзя отменить.")) return;
    await deleteFamilyRoomApi(s);
    clearAllFamilyLocalData();
    router.replace("/tools/family");
  }

  async function handleLeaveFamily() {
    const s = loadParentSession();
    if (!s || !confirm("Покинуть семью? Вы потеряете доступ к карте и участникам.")) return;
    await leaveFamilyApi(s);
    clearParentSession();
    router.replace("/tools/family");
  }

  if (!session) {
    return <div className="flex h-[100dvh] items-center justify-center text-gray-500 text-sm">Загрузка…</div>;
  }

  const roleLabel = isOwner ? "Создатель семьи" : "Родитель";

  return (
    <FamilyShell
      title={session.roomName}
      subtitle={roleLabel}
      backHref="/tools/family"
      trailing={
        <SettingsHeaderButton
          active={showSettings}
          onClick={() => setShowSettings((v) => !v)}
        />
      }
    >
      <div className="flex flex-col min-h-full min-w-0 max-w-full pb-8">
        <div className="px-3 grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 min-w-0 w-full">
          <Link
            href="/tools/family/parent/scan"
            className="min-w-0 rounded-lg bg-gray-900 text-white py-2 px-2 text-center text-xs font-medium touch-manipulation active:opacity-90"
          >
            <span className="sm:hidden">+ Участник</span>
            <span className="hidden sm:inline">+ Добавить участника</span>
          </Link>
          <Link
            href={parentMapUrl(roomId, selectedChildId)}
            className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-2 text-xs font-medium touch-manipulation active:bg-gray-50"
          >
            Карта
          </Link>
        </div>

        <ShareLocationPanel
          shareWithChildren={shareWithChildren}
          shareWithParents={shareWithParents}
          hasOtherParent={hasOtherParent}
          loading={shareLoading}
          onShareWithChildren={(v) => void handleShareToggle("children", v)}
          onShareWithParents={(v) => void handleShareToggle("parents", v)}
        />

        <div className="px-3 pb-3">
          <div className="rounded-lg overflow-hidden border border-gray-200 h-40">
            <MiniMap
              locations={locations}
              members={mapMembers}
              sos={sos}
              focusMemberId={selectedChildId}
              selectedMemberId={selectedChildId}
              parentMemberIds={parentMemberIds}
            />
          </div>
        </div>

        <ChildrenList
          children={children}
          locations={locations}
          sos={sos}
          selectedId={selectedChildId}
          onSelect={setSelectedChildId}
          onRemove={isOwner ? handleRemoveParticipant : undefined}
          onClearSos={handleClearSos}
          mapHrefFor={(memberId) =>
            locations.some((l) => l.memberId === memberId)
              ? parentMapMemberUrl(roomId, memberId)
              : null
          }
          messageHrefFor={(memberId) => childMessageHrefs.get(memberId) ?? null}
        />

        <ParentsList
          parents={parents}
          canRemoveParent={isOwner}
          onRemoveParent={handleRemoveParent}
          canInviteParent={isOwner}
          inviteHref="/tools/family/parent/invite"
          mapHrefFor={(p) => {
            if (p.memberId === session.memberId) return null;
            if (!p.shareLocationWithParents) return null;
            if (!locations.some((l) => l.memberId === p.memberId)) return null;
            return parentMapMemberUrl(roomId, p.memberId);
          }}
          messageHrefFor={(p) =>
            p.messengerPeerPhone ? messengerChatUrl(p.messengerPeerPhone, returnTo) : null
          }
        />

        {showSettings && session && (
          <div className="p-3 space-y-3 border-t border-gray-100">
            {isOwner && (
              <SosPhoneSettings
                session={session}
                sosPhone={snapshot?.room.sosPhone}
                onSaved={() => void poll()}
              />
            )}
            {isOwner ? (
              <button type="button" onClick={handleDeleteRoom} className="w-full text-xs text-red-600 underline">
                Удалить семью
              </button>
            ) : (
              <button type="button" onClick={handleLeaveFamily} className="w-full text-xs text-red-600 underline">
                Покинуть семью
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                clearParentSession();
                router.replace("/tools/family");
              }}
              className="w-full rounded-lg border border-gray-200 py-1.5 text-xs"
            >
              Выйти с устройства
            </button>
          </div>
        )}
      </div>
    </FamilyShell>
  );
}

export function ParentRoomClient() {
  return (
    <Suspense fallback={<div className="flex h-[100dvh] items-center justify-center text-gray-500 text-sm">Загрузка…</div>}>
      <ParentRoomInner />
    </Suspense>
  );
}
