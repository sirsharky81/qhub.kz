"use client";

import { useState } from "react";
import { apiCreateFamily, apiDeleteFamily } from "@/lib/split/client";
import { MOBILE_SAFE_INPUT_CLASS } from "@/lib/platform/mobile-viewport";
import type { SplitFamily, SplitRoomSnapshot, SplitSession } from "@/lib/split/types";

interface Props {
  session: SplitSession;
  snapshot: SplitRoomSnapshot;
  families: SplitFamily[];
  pending: boolean;
  onRefresh: () => Promise<void>;
  onError: (message: string | null) => void;
  startAction: (fn: () => Promise<void>) => void;
}

function familyWeight(f: SplitFamily): number {
  return f.memberIds.length + f.childrenCount;
}

export function SplitFamiliesPanel({
  session,
  snapshot,
  families,
  pending,
  onRefresh,
  onError,
  startAction,
}: Props) {
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [childrenCount, setChildrenCount] = useState("0");
  const isOpen = snapshot.room.status === "open";

  const groupedIds = new Set(families.flatMap((f) => f.memberIds));
  const availableMembers = snapshot.members.filter((m) => !groupedIds.has(m.memberId));

  return (
    <div className="space-y-3">
      {families.length === 0 && (
        <p className="text-sm text-emerald-950/45">Пока нет ни одной семьи</p>
      )}
      <ul className="space-y-2">
        {families.map((f) => (
          <li
            key={f.id}
            className="flex items-start justify-between gap-2 text-sm border-b border-emerald-900/5 py-2"
          >
            <div className="min-w-0">
              <div className="font-medium truncate">
                {f.name} <span className="text-emerald-950/40">· вес {familyWeight(f)}</span>
              </div>
              <div className="text-xs text-emerald-950/45">
                {f.memberIds
                  .map((id) => snapshot.members.find((m) => m.memberId === id)?.displayName ?? id)
                  .join(", ")}
                {f.childrenCount > 0 ? ` + ${f.childrenCount} реб.` : ""}
              </div>
            </div>
            {isOpen && (
              <button
                type="button"
                disabled={pending}
                className="shrink-0 text-xs text-rose-700"
                onClick={() => {
                  onError(null);
                  startAction(async () => {
                    try {
                      await apiDeleteFamily(session, f.id);
                      await onRefresh();
                    } catch (err) {
                      onError(err instanceof Error ? err.message : "Ошибка");
                    }
                  });
                }}
              >
                Удалить
              </button>
            )}
          </li>
        ))}
      </ul>

      {isOpen && (
        <div className="space-y-2 rounded-xl border border-emerald-900/10 bg-white/60 p-3">
          <p className="text-xs text-emerald-950/50">
            Добавить семью — взрослые (участники комнаты) + число детей. Дети не участвуют в
            комнате, но добавляют вес семье при делении «по составу семей».
          </p>
          <input
            placeholder="Название семьи"
            className={`w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2 outline-none focus:border-teal-700 ${MOBILE_SAFE_INPUT_CLASS}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            enterKeyHint="next"
          />
          {availableMembers.length === 0 ? (
            <p className="text-xs text-emerald-950/45">
              Все участники уже состоят в семьях. Удалите участника из семьи, чтобы перегруппировать.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableMembers.map((m) => {
                const on = selectedIds.includes(m.memberId);
                return (
                  <button
                    key={m.memberId}
                    type="button"
                    onClick={() =>
                      setSelectedIds((prev) =>
                        on ? prev.filter((id) => id !== m.memberId) : [...prev, m.memberId],
                      )
                    }
                    className={`rounded-lg px-2.5 py-1 text-xs border ${
                      on
                        ? "bg-teal-800 text-white border-teal-800"
                        : "bg-white text-emerald-950/70 border-emerald-900/15"
                    }`}
                  >
                    {m.displayName}
                  </button>
                );
              })}
            </div>
          )}
          <label className="block space-y-1">
            <span className="text-xs text-emerald-950/60">Детей в семье</span>
            <input
              inputMode="numeric"
              className={`w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2 outline-none focus:border-teal-700 ${MOBILE_SAFE_INPUT_CLASS}`}
              value={childrenCount}
              onChange={(e) => setChildrenCount(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </label>
          <button
            type="button"
            disabled={pending || !name.trim() || selectedIds.length === 0}
            className="w-full rounded-xl bg-emerald-900 text-white py-2.5 text-sm disabled:opacity-60"
            onClick={() => {
              onError(null);
              startAction(async () => {
                try {
                  await apiCreateFamily(session, {
                    name: name.trim(),
                    memberIds: selectedIds,
                    childrenCount: Number(childrenCount || "0"),
                  });
                  setName("");
                  setSelectedIds([]);
                  setChildrenCount("0");
                  await onRefresh();
                } catch (err) {
                  onError(err instanceof Error ? err.message : "Ошибка");
                }
              });
            }}
          >
            Добавить семью
          </button>
        </div>
      )}
    </div>
  );
}
