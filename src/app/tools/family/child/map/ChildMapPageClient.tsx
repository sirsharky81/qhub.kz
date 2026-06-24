"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { FamilyShell } from "../../components/FamilyShell";
import { POLL_HIDDEN_MS, POLL_VISIBLE_MS } from "@/lib/family/constants";
import { pollFamilyRoomApi } from "@/lib/family/client";
import { loadChildSession, clearAllFamilyLocalData } from "@/lib/family/session";
import type { FamilyMemberPublic, FamilyPollSnapshot } from "@/lib/family/types";

const FamilyMap = dynamic(() => import("../../components/FamilyMap").then((m) => m.FamilyMap), {
  ssr: false,
});

function chipMembers(snapshot: FamilyPollSnapshot, sessionMemberId: string): FamilyMemberPublic[] {
  const items: FamilyMemberPublic[] = [];
  const self = snapshot.members.find((m) => m.memberId === sessionMemberId);
  if (self) items.push(self);

  for (const parent of snapshot.parents) {
    if (!parent.shareLocationWithChildren) continue;
    if (!snapshot.locations.some((l) => l.memberId === parent.memberId)) continue;
    items.push({ memberId: parent.memberId, role: "observer", name: parent.name });
  }
  return items;
}

function MapInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMember = searchParams.get("member") ?? undefined;
  const [snapshot, setSnapshot] = useState<FamilyPollSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialMember);
  const versionRef = useRef(0);

  const session = loadChildSession();

  const poll = useCallback(async () => {
    const s = loadChildSession();
    if (!s) {
      router.replace("/tools/family/child");
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
  }, [router]);

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

  if (!session) return null;

  const chips = snapshot ? chipMembers(snapshot, session.memberId) : [];
  const parents = snapshot?.parents ?? [];
  const mapMembers = chips;

  return (
    <FamilyShell title="Карта" backHref="/tools/family/child" fullWidth>
      <div className="h-[calc(100dvh-4rem)] flex flex-col">
        <div className="flex gap-2 p-2 overflow-x-auto shrink-0 border-b border-gray-100">
          {chips.map((m) => (
            <button
              key={m.memberId}
              type="button"
              onClick={() => setSelectedId(m.memberId)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                selectedId === m.memberId ? "bg-sky-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {m.name}
              {m.memberId === session.memberId ? " (я)" : ""}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0">
          <FamilyMap
            locations={snapshot?.locations ?? []}
            members={mapMembers}
            sos={snapshot?.sos.filter((s) => s.memberId === session.memberId) ?? []}
            height="100%"
            interactive
            focusMemberId={selectedId ?? session.memberId}
            selectedMemberId={selectedId ?? session.memberId}
            parentMemberIds={parents.map((p) => p.memberId)}
          />
        </div>
      </div>
    </FamilyShell>
  );
}

export function ChildMapPageClient() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500">Загрузка…</div>}>
      <MapInner />
    </Suspense>
  );
}
