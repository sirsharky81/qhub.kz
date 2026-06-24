"use client";

import type { FamilyParentPublic } from "@/lib/family/types";
import { ShowOnMapLink } from "./ShowOnMapLink";

interface Props {
  parents: FamilyParentPublic[];
  selectedId?: string;
  onSelect?: (memberId: string) => void;
  showSharingStatus?: boolean;
  canRemoveParent?: boolean;
  onRemoveParent?: (memberId: string) => void;
  canInviteParent?: boolean;
  inviteHref?: string;
  canSelectParent?: (parent: FamilyParentPublic) => boolean;
  mapHrefFor?: (parent: FamilyParentPublic) => string | null;
}

export function ParentsList({
  parents,
  selectedId,
  onSelect,
  showSharingStatus,
  canRemoveParent,
  onRemoveParent,
  canInviteParent,
  inviteHref,
  canSelectParent,
  mapHrefFor,
}: Props) {
  const hasSecondParent = parents.some((p) => !p.isCreator);

  return (
    <div className="mt-2">
      <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Родители:</p>
      <ul className="divide-y divide-gray-100">
        {parents.map((parent) => {
          const isSelected = selectedId === parent.memberId;
          const selectable = !canSelectParent || canSelectParent(parent);
          const mapHref = mapHrefFor?.(parent) ?? null;
          const row = (
            <>
              <div className="flex items-center justify-between gap-3 min-w-0 flex-1">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">
                    {parent.name}
                    {parent.isCreator && (
                      <span className="ml-1.5 text-[10px] font-normal text-gray-400">создатель</span>
                    )}
                  </p>
                  {showSharingStatus && parent.shareLocationWithChildren && (
                    <p className="text-[11px] text-emerald-600 mt-0.5">На карте</p>
                  )}
                  {showSharingStatus && !parent.shareLocationWithChildren && (
                    <p className="text-[11px] text-gray-400 mt-0.5">Геопозиция скрыта</p>
                  )}
                </div>
                {canRemoveParent && !parent.isCreator && onRemoveParent && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveParent(parent.memberId);
                    }}
                    className="shrink-0 w-8 h-8 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 active:bg-red-50 text-base leading-none touch-manipulation"
                    aria-label={`Удалить ${parent.name}`}
                  >
                    ×
                  </button>
                )}
              </div>
            </>
          );

          const rowWithMap = (
            <div className={`flex items-stretch min-h-[2.75rem] ${isSelected ? "bg-sky-50" : ""}`}>
              {onSelect && selectable ? (
                <button
                  type="button"
                  onClick={() => onSelect(parent.memberId)}
                  className="flex-1 min-w-0 py-2 px-3 text-left hover:bg-gray-50 active:bg-gray-50 transition-colors touch-manipulation"
                >
                  {row}
                </button>
              ) : (
                <div className={`flex-1 py-2 px-3 ${!selectable && onSelect ? "opacity-70" : ""}`}>
                  {row}
                </div>
              )}
              {mapHref && <ShowOnMapLink href={mapHref} />}
            </div>
          );

          return <li key={parent.memberId}>{rowWithMap}</li>;
        })}
        {canInviteParent && !hasSecondParent && inviteHref && (
          <li>
            <a
              href={inviteHref}
              className="flex items-center gap-1.5 py-2 px-3 text-xs font-medium text-sky-700 hover:bg-sky-50 active:bg-sky-50 min-h-[40px] touch-manipulation"
            >
              <span className="text-sm leading-none">+</span>
              Пригласить второго родителя
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}
