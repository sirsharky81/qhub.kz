"use client";

import { MEMBER_TYPE_LABELS, normalizeMemberType } from "@/lib/family/member-types";
import { ShowOnMapLink } from "./ShowOnMapLink";

interface Props {
  name: string;
  memberType?: string;
  selected: boolean;
  onSelect: () => void;
  mapHref?: string | null;
}

export function SelfParticipantRow({ name, memberType, selected, onSelect, mapHref }: Props) {
  const roleLabel = MEMBER_TYPE_LABELS[normalizeMemberType(memberType)];

  return (
    <div className="mt-1">
      <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Участник</p>
      <div className={`flex items-stretch min-h-[3.25rem] ${selected ? "bg-sky-50" : ""}`}>
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 flex items-center gap-2 min-w-0 py-2.5 px-4 text-left hover:bg-gray-50 active:bg-gray-50 transition-colors touch-manipulation"
        >
          <span className="font-medium truncate min-w-0 flex-1">{name}</span>
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{roleLabel}</span>
          <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">я</span>
        </button>
        {mapHref && <ShowOnMapLink href={mapHref} />}
      </div>
    </div>
  );
}
