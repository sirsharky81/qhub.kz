"use client";

import { useState } from "react";
import { apiCreateFamily, apiUpdateFamily } from "@/lib/split/client";
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

/**
 * "own_family" rooms have exactly one household — everyone in the room — so
 * there's no "create a family" step like in multi_family rooms. This panel
 * just tracks the number of children (for display) and keeps that single
 * family record's member list in sync with the room roster; adding people is
 * done via the regular "Участники" panel above.
 */
export function SplitOwnFamilyPanel({
  session,
  snapshot,
  families,
  pending,
  onRefresh,
  onError,
  startAction,
}: Props) {
  const existing = families[0] ?? null;
  const [childrenCount, setChildrenCount] = useState(String(existing?.childrenCount ?? 0));
  const isOpen = snapshot.room.status === "open";

  // Reset the input whenever the underlying family record changes (e.g. after
  // save, or on first load) — adjusted during render rather than in an effect.
  const [syncedFamilyState, setSyncedFamilyState] = useState({
    id: existing?.id,
    childrenCount: existing?.childrenCount,
  });
  if (syncedFamilyState.id !== existing?.id || syncedFamilyState.childrenCount !== existing?.childrenCount) {
    setSyncedFamilyState({ id: existing?.id, childrenCount: existing?.childrenCount });
    setChildrenCount(String(existing?.childrenCount ?? 0));
  }

  const memberIds = snapshot.members.map((m) => m.memberId);
  const outOfSync =
    existing !== null &&
    (existing.memberIds.length !== memberIds.length ||
      !memberIds.every((id) => existing.memberIds.includes(id)));

  function save() {
    onError(null);
    startAction(async () => {
      try {
        if (existing) {
          await apiUpdateFamily(session, existing.id, {
            memberIds,
            childrenCount: Number(childrenCount || "0"),
          });
        } else {
          await apiCreateFamily(session, {
            name: "Семья",
            memberIds,
            childrenCount: Number(childrenCount || "0"),
          });
        }
        await onRefresh();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Ошибка");
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-emerald-950/50">
        В комнате «своя семья» все участники — одна семья. Чтобы добавить нового члена семьи,
        воспользуйтесь разделом «Участники» выше — он автоматически будет учтён здесь.
      </p>
      <div className="rounded-xl border border-emerald-900/10 bg-white/60 p-3 space-y-1">
        <div className="text-xs font-medium text-emerald-950/70">Взрослые в семье</div>
        <div className="text-sm text-emerald-950/70">
          {snapshot.members.map((m) => m.displayName).join(", ")}
        </div>
      </div>
      {isOpen && (
        <div className="space-y-2 rounded-xl border border-emerald-900/10 bg-white/60 p-3">
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
            disabled={pending}
            className="w-full rounded-xl bg-emerald-900 text-white py-2.5 text-sm disabled:opacity-60"
            onClick={save}
          >
            Сохранить
          </button>
          {outOfSync && (
            <p className="text-[11px] text-emerald-950/40">
              Состав участников обновится автоматически при сохранении.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
