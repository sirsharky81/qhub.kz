"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchRoomManage,
  mutateRoomManage,
  type RoomManageParticipant,
  type RoomManageSnapshot,
} from "@/lib/messenger/client";
import { buildRoomJoinUrl, exportRoomKeyBase64Url } from "@/lib/messenger/crypto";

interface Props {
  open: boolean;
  roomId: string;
  aesKey: CryptoKey;
  onClose: () => void;
}

export function RoomSettingsModal({ open, roomId, aesKey, onClose }: Props) {
  const [snapshot, setSnapshot] = useState<RoomManageSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addPhone, setAddPhone] = useState("");
  const [busyPhone, setBusyPhone] = useState<string | null>(null);
  const [roomKey, setRoomKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRoomManage(roomId);
      if (!data) {
        setError("Не удалось загрузить настройки комнаты");
        return;
      }
      setSnapshot(data);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    void exportRoomKeyBase64Url(aesKey).then(setRoomKey).catch(() => setRoomKey(null));
  }, [open, aesKey]);

  const joinUrl = useMemo(() => {
    if (!roomKey) return "";
    return buildRoomJoinUrl(roomId, roomKey);
  }, [roomId, roomKey]);

  async function runAction(action: "add" | "remove" | "promote" | "demote", targetPhone: string) {
    setBusyPhone(targetPhone);
    setError(null);
    try {
      const res = await mutateRoomManage({ roomId, action, targetPhone });
      if (!res.ok) {
        setError(res.error ?? "Ошибка");
        return;
      }
      await load();
    } finally {
      setBusyPhone(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[250] bg-black/35" onClick={onClose} role="button" tabIndex={-1}>
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Настройки комнаты {roomId}</h3>
          <button type="button" onClick={onClose} className="text-xs text-gray-500">
            Закрыть
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Загрузка…</p>
        ) : (
          <div className="space-y-4">
            <section className="rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-700">Приглашение</p>
              <p className="text-[11px] text-gray-500 mt-1">Код: {roomId}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs"
                  onClick={() => void navigator.clipboard.writeText(roomId)}
                >
                  Копировать код
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs"
                  onClick={() => void navigator.clipboard.writeText(joinUrl)}
                  disabled={!joinUrl}
                >
                  Копировать ссылку
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-700">Добавить из whitelist</p>
              <div className="flex gap-2">
                <input
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  placeholder="+7XXXXXXXXXX"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white"
                  disabled={!addPhone.trim()}
                  onClick={() => {
                    const phone = addPhone.trim();
                    setAddPhone("");
                    void runAction("add", phone);
                  }}
                >
                  Добавить
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Участники</p>
              <div className="space-y-2">
                {(snapshot?.participants ?? []).map((p: RoomManageParticipant) => {
                  const role = p.role ?? "member";
                  const isOwner = role === "owner";
                  const disabled = busyPhone === p.phone;
                  return (
                    <div key={p.phone} className="rounded-lg border border-gray-100 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm text-gray-900">{p.phone}</p>
                          <p className="text-[11px] text-gray-500">role: {role}</p>
                        </div>
                        <div className="flex gap-1">
                          {!isOwner && role !== "admin" && (
                            <button
                              type="button"
                              className="rounded border border-gray-200 px-2 py-1 text-[11px]"
                              onClick={() => void runAction("promote", p.phone)}
                              disabled={disabled}
                            >
                              В админы
                            </button>
                          )}
                          {!isOwner && role === "admin" && (
                            <button
                              type="button"
                              className="rounded border border-gray-200 px-2 py-1 text-[11px]"
                              onClick={() => void runAction("demote", p.phone)}
                              disabled={disabled}
                            >
                              Снять админа
                            </button>
                          )}
                          {!isOwner && (
                            <button
                              type="button"
                              className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-700"
                              onClick={() => void runAction("remove", p.phone)}
                              disabled={disabled}
                            >
                              Удалить
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
