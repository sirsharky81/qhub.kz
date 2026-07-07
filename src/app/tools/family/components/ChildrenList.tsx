"use client";

import type { FamilyLocation, FamilyMemberPublic, FamilySosState } from "@/lib/family/types";
import { MEMBER_TYPE_LABELS, normalizeMemberType } from "@/lib/family/member-types";
import { getParticipantPresence } from "@/lib/family/participant-status";
import { BatteryBadge } from "./BatteryBadge";
import { MessageMemberLink } from "./MessageMemberLink";
import { ParticipantStatusBadge } from "./ParticipantStatusBadge";
import { ShowOnMapLink } from "./ShowOnMapLink";

interface Props {
  children: FamilyMemberPublic[];
  locations: FamilyLocation[];
  sos: FamilySosState[];
  selectedId?: string;
  onSelect: (memberId: string) => void;
  onRemove?: (memberId: string) => void;
  onClearSos?: (memberId: string) => void;
  onRequestLocation?: (memberId: string) => void;
  requestLocationLoadingId?: string | null;
  mapHrefFor?: (memberId: string) => string | null;
  messageHrefFor?: (memberId: string) => string | null;
}

export function ChildrenList({
  children,
  locations,
  sos,
  selectedId,
  onSelect,
  onRemove,
  onClearSos,
  onRequestLocation,
  requestLocationLoadingId,
  mapHrefFor,
  messageHrefFor,
}: Props) {
  const locMap = new Map(locations.map((l) => [l.memberId, l]));
  const sosMap = new Map(sos.map((s) => [s.memberId, s]));

  if (children.length === 0) {
    return (
      <p className="px-3 py-4 text-[11px] text-gray-500 text-center leading-relaxed">
        Пока нет привязанных участников. Нажмите «Добавить участника» и отсканируйте QR с его устройства.
      </p>
    );
  }

  return (
    <div>
      <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Участники:</p>
      <ul className="divide-y divide-gray-100">
        {children.map((child) => {
          const loc = locMap.get(child.memberId);
          const sosState = sosMap.get(child.memberId);
          const isSelected = selectedId === child.memberId;
          const mapHref = mapHrefFor?.(child.memberId) ?? null;
          const messageHref = messageHrefFor?.(child.memberId) ?? null;
          const sharesLocation = child.shareLocationWithParents !== false;
          const presence = getParticipantPresence(sharesLocation, loc);
          const isRequestLoading = requestLocationLoadingId === child.memberId;
          return (
            <li key={child.memberId}>
              <div
                className={`flex items-stretch min-h-[2.75rem] ${isSelected ? "bg-sky-50" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(child.memberId)}
                  className="flex-1 min-w-0 flex items-center justify-between gap-2 py-2 px-3 text-left hover:bg-gray-50 active:bg-gray-50 transition-colors touch-manipulation"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">
                      {child.name}
                      {sosState?.active && (
                        <span className="ml-1.5 text-[10px] font-bold text-red-600 uppercase">SOS</span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {MEMBER_TYPE_LABELS[normalizeMemberType(child.memberType)]}
                    </p>
                    {loc && sharesLocation ? (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Обновлено {new Date(loc.updatedAt).toLocaleTimeString("ru-RU")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <ParticipantStatusBadge
                      shareLocationWithParents={sharesLocation}
                      location={loc}
                    />
                    <BatteryBadge level={loc?.battery} />
                  </div>
                </button>
                {messageHref && <MessageMemberLink href={messageHref} />}
                {mapHref && <ShowOnMapLink href={mapHref} />}
              </div>
              {sharesLocation && onRequestLocation ? (
                <div className="px-3 pb-1.5">
                  <button
                    type="button"
                    disabled={isRequestLoading}
                    onClick={() => onRequestLocation(child.memberId)}
                    className="text-xs text-sky-700 underline disabled:opacity-50"
                  >
                    {isRequestLoading
                      ? "Запрос отправлен…"
                      : presence === "offline"
                        ? "Запросить геопозицию"
                        : "Обновить геопозицию"}
                  </button>
                </div>
              ) : null}
              {(onClearSos && sosState?.active) || onRemove ? (
                <div className="px-3 pb-1.5 flex gap-3">
                  {sosState?.active && onClearSos && (
                    <button
                      type="button"
                      onClick={() => onClearSos(child.memberId)}
                      className="text-xs text-red-600 underline"
                    >
                      Снять SOS
                    </button>
                  )}
                  {onRemove && (
                    <button
                      type="button"
                      onClick={() => onRemove(child.memberId)}
                      className="text-xs text-gray-500 underline"
                    >
                      Удалить
                    </button>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
