"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { FamilyShell } from "../../../components/FamilyShell";
import { POLL_HIDDEN_MS, POLL_VISIBLE_MS } from "@/lib/family/constants";
import { pollFamilyRoomApi } from "@/lib/family/client";
import { loadParentSession, clearAllFamilyLocalData } from "@/lib/family/session";
import type { FamilyMemberPublic, FamilyPollSnapshot } from "@/lib/family/types";

const FamilyMap = dynamic(
  () => import("../../../components/FamilyMap").then((m) => m.FamilyMap),
  { ssr: false },
);

function mapChipMembers(
  snapshot: FamilyPollSnapshot,
  sessionMemberId: string | undefined,
): FamilyMemberPublic[] {
  const children = snapshot.members.filter((m) => m.role === "tracked");
  const parentChips = snapshot.parents
    .filter(
      (p) =>
        p.memberId !== sessionMemberId &&
        p.shareLocationWithParents &&
        snapshot.locations.some((l) => l.memberId === p.memberId),
    )
    .map((p) => ({ memberId: p.memberId, role: "observer" as const, name: p.name }));
  return [...children, ...parentChips];
}

function MapInner({ roomId }: { roomId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMember =
    searchParams.get("member") ?? searchParams.get("child") ?? undefined;
  const [snapshot, setSnapshot] = useState<FamilyPollSnapshot | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>(
    initialMember ?? undefined,
  );
  const versionRef = useRef(0);

  const poll = useCallback(async () => {
    const s = loadParentSession();
    if (!s || s.roomId.toUpperCase() !== roomId.toUpperCase()) {
      router.replace("/tools/family/parent");
      return;
    }
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
    }
  }, [roomId, router]);

  useEffect(() => {
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
  }, [poll]);

  const session = loadParentSession();
  const chips = snapshot ? mapChipMembers(snapshot, session?.memberId) : [];
  const parents = snapshot?.parents ?? [];
  const mapMembers = [
    ...chips,
    ...(snapshot?.parents
      .filter((p) => p.memberId !== session?.memberId && p.shareLocationWithParents)
      .map((p) => ({ memberId: p.memberId, role: "observer" as const, name: p.name })) ?? []),
  ];
  const uniqueMapMembers = [...new Map(mapMembers.map((m) => [m.memberId, m])).values()];

  return (
    <FamilyShell title="Карта семьи" backHref={`/tools/family/parent/room/${roomId}`} fullWidth>
      <div className="h-[calc(100dvh-4rem)] flex flex-col">
        <div className="flex gap-2 p-2 overflow-x-auto shrink-0 border-b border-gray-100">
          {chips.map((m) => (
            <button
              key={m.memberId}
              type="button"
              onClick={() => setSelectedMemberId(m.memberId)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                selectedMemberId === m.memberId ? "bg-sky-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0">
          <FamilyMap
            locations={snapshot?.locations ?? []}
            members={uniqueMapMembers}
            sos={snapshot?.sos ?? []}
            height="100%"
            interactive
            focusMemberId={selectedMemberId}
            selectedMemberId={selectedMemberId}
            parentMemberIds={parents.map((p) => p.memberId)}
          />
        </div>
      </div>
    </FamilyShell>
  );
}

export function ParentMapPageClient({ roomId }: { roomId: string }) {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500">Загрузка…</div>}>
      <MapInner roomId={roomId} />
    </Suspense>
  );
}
