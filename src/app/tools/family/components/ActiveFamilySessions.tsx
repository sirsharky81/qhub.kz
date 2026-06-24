"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadChildPairingSession,
  loadChildSession,
  loadParentSession,
} from "@/lib/family/session";
import type { FamilyMemberRole } from "@/lib/family/types";

interface SavedEntry {
  key: string;
  href: string;
  roomName: string;
  memberName: string;
  roleLabel: string;
  hint: string;
}

function roleLabel(role: FamilyMemberRole): string {
  if (role === "owner") return "Создатель";
  if (role === "observer") return "Родитель";
  return "Участник";
}

function buildEntries(): SavedEntry[] {
  const entries: SavedEntry[] = [];

  const parent = loadParentSession();
  if (parent?.roomId) {
    entries.push({
      key: `parent-${parent.roomId}`,
      href: `/tools/family/parent/room/${parent.roomId}`,
      roomName: parent.roomName || "Семья",
      memberName: parent.name,
      roleLabel: roleLabel(parent.role),
      hint: "Открыть панель родителя",
    });
  }

  const child = loadChildSession();
  if (child?.roomId) {
    entries.push({
      key: `child-${child.roomId}`,
      href: "/tools/family/child",
      roomName: child.roomName || "Семья",
      memberName: child.name,
      roleLabel: roleLabel(child.role),
      hint: "Открыть приложение участника",
    });
    return entries;
  }

  const pairing = loadChildPairingSession();
  if (pairing) {
    entries.push({
      key: `pairing-${pairing.pairToken}`,
      href: "/tools/family/child",
      roomName: "Подключение",
      memberName: pairing.name,
      roleLabel: "Участник",
      hint: "Ожидание сканирования QR родителем",
    });
  }

  return entries;
}

export function ActiveFamilySessions() {
  const [entries, setEntries] = useState<SavedEntry[]>([]);

  useEffect(() => {
    setEntries(buildEntries());
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">На этом устройстве</p>
      {entries.map((entry) => (
        <Link
          key={entry.key}
          href={entry.href}
          className="block rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 touch-manipulation active:bg-emerald-100/80 transition-colors"
        >
          <div className="flex items-start justify-between gap-3 min-w-0">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-gray-900 truncate">{entry.roomName}</p>
              <p className="text-xs text-gray-600 mt-0.5 truncate">
                {entry.memberName}
                <span className="text-gray-400"> · </span>
                {entry.roleLabel}
              </p>
              <p className="text-xs text-emerald-700 mt-1">{entry.hint}</p>
            </div>
            <span className="shrink-0 text-emerald-600 text-sm font-medium pt-0.5">Войти →</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
