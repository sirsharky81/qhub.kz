"use client";

import dynamic from "next/dynamic";
import type { FamilyLocation, FamilyMemberPublic, FamilySosState } from "@/lib/family/types";

const FamilyMap = dynamic(() => import("./FamilyMap").then((m) => m.FamilyMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-gray-500">
      Загрузка карты…
    </div>
  ),
});

interface Props {
  locations: FamilyLocation[];
  members: FamilyMemberPublic[];
  sos: FamilySosState[];
  focusMemberId?: string;
  selectedMemberId?: string;
  parentMemberIds?: string[];
}

export function MiniMap({
  locations,
  members,
  sos,
  focusMemberId,
  selectedMemberId,
  parentMemberIds,
}: Props) {
  return (
    <FamilyMap
      locations={locations}
      members={members}
      sos={sos}
      height="100%"
      interactive={false}
      focusMemberId={focusMemberId}
      selectedMemberId={selectedMemberId}
      parentMemberIds={parentMemberIds}
    />
  );
}
