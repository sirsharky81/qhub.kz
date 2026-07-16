"use client";

import { useState } from "react";
import {
  apiAddLocalParticipant,
  apiInviteParticipant,
  apiTransferOwnership,
} from "@/lib/split/client";
import { SPLIT_BRANDED_NAME } from "@/lib/split/constants";
import { MOBILE_SAFE_INPUT_CLASS } from "@/lib/platform/mobile-viewport";
import type { SplitMemberPublic, SplitRoomSnapshot, SplitSession } from "@/lib/split/types";

interface Props {
  session: SplitSession;
  snapshot: SplitRoomSnapshot;
  pending: boolean;
  inviteUrl: string | null;
  onInviteUrl: (url: string | null) => void;
  onRefresh: () => Promise<void>;
  onError: (message: string | null) => void;
  startAction: (fn: () => Promise<void>) => void;
}

function statusLabel(m: SplitMemberPublic): string {
  if (m.role === "owner" && m.status === "local") return "Владелец · локальный";
  if (m.role === "owner" && m.status === "pending_invite") return "Владелец · приглашение отправлено";
  if (m.role === "owner") return "Владелец · QHub";
  switch (m.status) {
    case "connected":
      return "Участник QHub";
    case "pending_invite":
      return "Приглашение отправлено";
    default:
      return "Локальный участник";
  }
}

export function SplitParticipantsPanel({
  session,
  snapshot,
  pending,
  inviteUrl,
  onInviteUrl,
  onRefresh,
  onError,
  startAction,
}: Props) {
  const [name, setName] = useState("");
  const isOpen = snapshot.room.status === "open";
  const canManageOwner =
    session.role === "owner" ||
    snapshot.members.some(
      (m) => m.memberId === snapshot.room.ownerMemberId && m.status !== "connected",
    );

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900/50">
        Участники
      </h2>
      <ul className="space-y-2">
        {snapshot.members.map((m) => (
          <li
            key={m.memberId}
            className="flex items-start justify-between gap-2 text-sm border-b border-emerald-900/5 py-2"
          >
            <div className="min-w-0">
              <div className="font-medium truncate">
                {m.displayName}
                {m.memberId === session.memberId ? " · вы" : ""}
              </div>
              <div className="text-xs text-emerald-950/45">{statusLabel(m)}</div>
            </div>
            {isOpen && (
              <div className="flex flex-col items-end gap-1 shrink-0">
                {(m.status === "local" || m.status === "pending_invite") && (
                  <button
                    type="button"
                    disabled={pending}
                    className="text-xs text-teal-800"
                    onClick={() => {
                      onError(null);
                      startAction(async () => {
                        try {
                          const invite = await apiInviteParticipant(session, m.memberId, "link");
                          const url = `${window.location.origin}${invite.joinPath}`;
                          onInviteUrl(url);
                          try {
                            if (navigator.clipboard?.writeText) {
                              await navigator.clipboard.writeText(url);
                            }
                          } catch {
                            try {
                              if (navigator.share) {
                                await navigator.share({ title: SPLIT_BRANDED_NAME, url, text: url });
                              }
                            } catch {
                              /* link shown below */
                            }
                          }
                          await onRefresh();
                        } catch (err) {
                          onError(err instanceof Error ? err.message : "Ошибка");
                        }
                      });
                    }}
                  >
                    Пригласить
                  </button>
                )}
                {canManageOwner &&
                  m.memberId !== snapshot.room.ownerMemberId &&
                  session.role === "owner" && (
                    <button
                      type="button"
                      disabled={pending}
                      className="text-xs text-emerald-900/50"
                      onClick={() => {
                        onError(null);
                        startAction(async () => {
                          try {
                            await apiTransferOwnership(session, m.memberId);
                            await onRefresh();
                          } catch (err) {
                            onError(err instanceof Error ? err.message : "Ошибка");
                          }
                        });
                      }}
                    >
                      Сделать владельцем
                    </button>
                  )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {isOpen && (
        <div className="space-y-2 rounded-xl border border-emerald-900/10 bg-white/60 p-3">
          <p className="text-xs text-emerald-950/50">Добавить локального участника без приглашения</p>
          <input
            placeholder="Имя"
            className={`w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2 outline-none focus:border-teal-700 ${MOBILE_SAFE_INPUT_CLASS}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            enterKeyHint="done"
          />
          <button
            type="button"
            disabled={pending || !name.trim()}
            className="w-full rounded-xl bg-emerald-900 text-white py-2.5 text-sm disabled:opacity-60"
            onClick={() => {
              onError(null);
              startAction(async () => {
                try {
                  await apiAddLocalParticipant(session, { displayName: name.trim() });
                  setName("");
                  await onRefresh();
                } catch (err) {
                  onError(err instanceof Error ? err.message : "Ошибка");
                }
              });
            }}
          >
            Добавить участника
          </button>
        </div>
      )}

      {inviteUrl && (
        <p className="text-xs break-all text-teal-800 bg-teal-50 rounded-lg p-2">{inviteUrl}</p>
      )}
    </section>
  );
}
