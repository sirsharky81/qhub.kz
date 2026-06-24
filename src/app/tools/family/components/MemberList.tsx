"use client";

import type { FamilyLocation, FamilyMemberPublic, FamilySosState } from "@/lib/family/types";
import { BatteryBadge } from "./BatteryBadge";

interface Props {
  members: FamilyMemberPublic[];
  locations: FamilyLocation[];
  sos: FamilySosState[];
  canManage: boolean;
  onRemove?: (memberId: string) => void;
  onClearSos?: (memberId: string) => void;
}

export function MemberList({ members, locations, sos, canManage, onRemove, onClearSos }: Props) {
  const locMap = new Map(locations.map((l) => [l.memberId, l]));
  const sosMap = new Map(sos.map((s) => [s.memberId, s]));

  const roleLabel = (role: FamilyMemberPublic["role"]) => {
    if (role === "owner") return "Владелец";
    if (role === "observer") return "Родитель";
    return "Участник";
  };

  return (
    <ul className="divide-y divide-gray-100">
      {members.map((m) => {
        const loc = locMap.get(m.memberId);
        const sosState = sosMap.get(m.memberId);
        return (
          <li key={m.memberId} className="flex items-center justify-between gap-3 py-3 px-4">
            <div className="min-w-0">
              <p className="font-medium truncate">
                {m.name}
                {sosState?.active && (
                  <span className="ml-2 text-xs font-bold text-red-600 uppercase">SOS</span>
                )}
              </p>
              <p className="text-xs text-gray-500">{roleLabel(m.role)}</p>
              {loc && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Обновлено {new Date(loc.updatedAt).toLocaleTimeString("ru-RU")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <BatteryBadge level={loc?.battery} />
              {sosState?.active && onClearSos && (
                <button
                  type="button"
                  onClick={() => onClearSos(m.memberId)}
                  className="text-xs text-red-600 underline"
                >
                  Снять SOS
                </button>
              )}
              {canManage && m.role !== "owner" && onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(m.memberId)}
                  className="text-xs text-gray-500 underline"
                >
                  Удалить
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
