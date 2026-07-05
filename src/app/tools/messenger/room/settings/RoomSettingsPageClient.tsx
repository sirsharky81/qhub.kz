"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessengerShell } from "../../components/MessengerShell";
import { messengerChatUrl, messengerRoomUrl } from "@/lib/app-routes";
import { fetchRoomManage, mutateRoomManage, type RoomManageParticipant, type RoomManageSnapshot } from "@/lib/messenger/client";

function roomSettingsHref(roomId: string): string {
  return `/tools/messenger/room/settings?id=${encodeURIComponent(roomId)}`;
}

export function RoomSettingsPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = useMemo(() => String(searchParams.get("id") ?? "").toUpperCase(), [searchParams]);
  const [snapshot, setSnapshot] = useState<RoomManageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [addPhone, setAddPhone] = useState("");
  const [lastTargetPhone, setLastTargetPhone] = useState<string>("");
  const [busyPhone, setBusyPhone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!roomId) return;
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
    if (!roomId) {
      router.replace("/tools/messenger/home");
      return;
    }
    void load();
  }, [roomId, load, router]);

  async function runAction(action: "add" | "remove" | "promote" | "demote", targetPhone: string) {
    setBusyPhone(targetPhone);
    setLastTargetPhone(targetPhone);
    setError(null);
    setErrorCode(null);
    try {
      const res = await mutateRoomManage({ roomId, action, targetPhone });
      if (!res.ok) {
        setError(res.error ?? "Ошибка");
        setErrorCode(res.code ?? null);
        return;
      }
      await load();
    } finally {
      setBusyPhone(null);
    }
  }

  function openInviteDm(phone: string) {
    const joinUrl = messengerRoomUrl(roomId);
    const text = `Приглашение в комнату ${roomId}: ${joinUrl}`;
    const href = `${messengerChatUrl(phone, roomSettingsHref(roomId))}&draft=${encodeURIComponent(text)}`;
    window.location.href = href;
  }

  function cancelAddFlow() {
    setError(null);
    setErrorCode(null);
    setLastTargetPhone("");
  }

  return (
    <MessengerShell
      variant="app"
      keyboardAware={false}
      title={`Настройки комнаты ${roomId}`}
      backHref={messengerRoomUrl(roomId)}
      subtitle={<span className="text-xs text-gray-500">Отдельная страница управления комнатой</span>}
    >
      <div
        className="flex-1 overflow-y-auto p-4 pb-28 space-y-4 max-w-xl w-full mx-auto"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {loading ? (
          <p className="text-sm text-gray-500">Загрузка…</p>
        ) : (
          <>
            <section className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-700">Приглашение</p>
              <p className="text-[11px] text-gray-500 mt-1">Код: {roomId}</p>
              <div className="mt-2 flex gap-2 flex-wrap">
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
                  onClick={() => void navigator.clipboard.writeText(messengerRoomUrl(roomId))}
                >
                  Копировать ссылку
                </button>
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                Если у пользователя отключено автодобавление, отправьте приглашение через личный чат.
              </p>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-700">Добавить по номеру телефона</p>
              <p className="text-[11px] text-gray-500">
                Без выпадающих списков: укажите номер вручную. Добавление только для active whitelist и зарегистрированных пользователей.
              </p>
              <div className="flex gap-2">
                <input
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  onFocus={(e) => {
                    // iOS Safari/PWA: ensure focused input stays above keyboard.
                    setTimeout(() => {
                      e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" });
                    }, 80);
                  }}
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
              {errorCode === "auto_add_disabled" && lastTargetPhone && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <p className="text-xs text-amber-900">
                    Пользователь запретил автодобавление в комнаты. Можно отправить приглашение в личный чат.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-indigo-700"
                      onClick={() => openInviteDm(lastTargetPhone)}
                    >
                      Пригласить
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700"
                      onClick={cancelAddFlow}
                    >
                      Отменить добавление
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-3">
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
                        <div className="flex gap-1 flex-wrap justify-end">
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
            <div className="pt-1">
              <Link href={messengerRoomUrl(roomId)} className="text-sm text-gray-500 underline">
                Вернуться в комнату
              </Link>
            </div>
          </>
        )}
      </div>
    </MessengerShell>
  );
}
