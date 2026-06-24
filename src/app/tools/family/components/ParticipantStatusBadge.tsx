"use client";

import type { FamilyLocation } from "@/lib/family/types";
import {
  getParticipantPresence,
  PRESENCE_LABELS,
  PRESENCE_LABELS_LONG,
} from "@/lib/family/participant-status";

interface Props {
  shareLocationWithParents: boolean;
  location?: FamilyLocation;
}

const STYLES = {
  online: "bg-emerald-100 text-emerald-800",
  offline: "bg-gray-100 text-gray-600",
  not_sharing: "bg-amber-100 text-amber-800",
} as const;

const DOT_STYLES = {
  online: "bg-emerald-500",
  offline: "bg-gray-400",
  not_sharing: "bg-amber-500",
} as const;

export function ParticipantStatusBadge({ shareLocationWithParents, location }: Props) {
  const presence = getParticipantPresence(shareLocationWithParents, location);

  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide max-w-[5.5rem] truncate ${STYLES[presence]}`}
      title={PRESENCE_LABELS_LONG[presence]}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${DOT_STYLES[presence]}`} />
      <span className="truncate">{PRESENCE_LABELS[presence]}</span>
    </span>
  );
}
