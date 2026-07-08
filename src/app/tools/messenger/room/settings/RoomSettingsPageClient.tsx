"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessengerShell } from "../../components/MessengerShell";
import { MessengerAvatar } from "../../components/MessengerAvatar";
import { AvatarCropModal } from "../../components/AvatarCropModal";
import { messengerChatUrl, messengerRoomUrl } from "@/lib/app-routes";
import {
  deleteRoomAvatar,
  fetchRoomManage,
  mutateRoomManage,
  updateRoomSettingsApi,
  uploadRoomAvatar,
  type RoomManageParticipant,
  type RoomManageSnapshot,
} from "@/lib/messenger/client";
import { MAX_ROOM_NAME_LENGTH } from "@/lib/messenger/constants";
import { upsertLocalDialog } from "@/lib/messenger/dialogs";
import { blobToBase64 } from "@/lib/messenger/files";

function roomSettingsHref(roomId: string): string {
  return `/tools/messenger/room/settings?id=${encodeURIComponent(roomId)}`;
}

export function RoomSettingsPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = useMemo(() => String(searchParams.get("id") ?? "").toUpperCase(), [searchParams]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [snapshot, setSnapshot] = useState<RoomManageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [addPhone, setAddPhone] = useState("");
  const [lastTargetPhone, setLastTargetPhone] = useState<string>("");
  const [busyPhone, setBusyPhone] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const canEdit = snapshot?.actorRole === "owner" || snapshot?.actorRole === "admin";

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
      setRoomName(data.name ?? "");
      setAvatarUrl(data.avatarUrl ?? null);
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

  async function handleSaveName() {
    if (!canEdit) return;
    setNameSaving(true);
    setNameSaved(false);
    setError(null);
    try {
      const res = await updateRoomSettingsApi({ roomId, name: roomName });
      if (!res.ok) {
        setError(res.error ?? "Не удалось сохранить имя");
        return;
      }
      const title = res.name?.trim() || `Комната ${roomId}`;
      setRoomName(res.name ?? "");
      setNameSaved(true);
      upsertLocalDialog({
        id: `room:${roomId}`,
        kind: "room",
        title,
        roomId,
        avatarUrl,
        createdAt: Date.now(),
      });
      setSnapshot((prev) => (prev ? { ...prev, name: res.name ?? null } : prev));
    } finally {
      setNameSaving(false);
    }
  }

  function handleAvatarPick(file: File | null) {
    if (!file || !canEdit) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("Выберите изображение");
      return;
    }
    setAvatarError(null);
    setCropFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAvatarCropConfirm(blob: Blob, mime: string) {
    if (!canEdit) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const data = await blobToBase64(blob);
      const res = await uploadRoomAvatar(roomId, data, mime);
      if (!res.ok) {
        setAvatarError(res.error ?? "Не удалось загрузить");
        return;
      }
      setAvatarUrl(res.avatarUrl ?? null);
      setCropFile(null);
      upsertLocalDialog({
        id: `room:${roomId}`,
        kind: "room",
        title: roomName.trim() || `Комната ${roomId}`,
        roomId,
        avatarUrl: res.avatarUrl ?? null,
        createdAt: Date.now(),
      });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Не удалось загрузить");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleAvatarRemove() {
    if (!canEdit) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const ok = await deleteRoomAvatar(roomId);
      if (!ok) {
        setAvatarError("Не удалось удалить аватар");
        return;
      }
      setAvatarUrl(null);
      upsertLocalDialog({
        id: `room:${roomId}`,
        kind: "room",
        title: roomName.trim() || `Комната ${roomId}`,
        roomId,
        avatarUrl: null,
        createdAt: Date.now(),
      });
    } finally {
      setAvatarBusy(false);
    }
  }

  const displayTitle = roomName.trim() || `Комната ${roomId}`;

  return (
    <MessengerShell
      variant="app"
      keyboardAware
      title={`Настройки комнаты ${roomId}`}
      backHref={messengerRoomUrl(roomId)}
      subtitle={<span className="text-xs text-gray-500">Отдельная страница управления комнатой</span>}
    >
      <div className="flex min-h-0 flex-1 flex-col max-w-xl w-full mx-auto">
        {loading ? (
          <p className="p-4 text-sm text-gray-500">Загрузка…</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
                <div className="flex flex-col items-center gap-2">
                  <MessengerAvatar
                    src={avatarUrl}
                    label={displayTitle}
                    size="lg"
                    kind="room"
                    seed={roomId}
                  />
                  {canEdit && (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        disabled={avatarBusy}
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs disabled:opacity-50"
                      >
                        {avatarBusy ? "Загрузка…" : avatarUrl ? "Сменить фото" : "Загрузить фото"}
                      </button>
                      {avatarUrl && (
                        <button
                          type="button"
                          disabled={avatarBusy}
                          onClick={() => void handleAvatarRemove()}
                          className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 disabled:opacity-50"
                        >
                          Удалить
                        </button>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleAvatarPick(e.target.files?.[0] ?? null)}
                      />
                    </div>
                  )}
                  {avatarError && <p className="text-xs text-red-600">{avatarError}</p>}
                </div>
                <AvatarCropModal
                  open={Boolean(cropFile)}
                  file={cropFile}
                  busy={avatarBusy}
                  onCancel={() => {
                    if (!avatarBusy) setCropFile(null);
                  }}
                  onConfirm={(blob, mime) => void handleAvatarCropConfirm(blob, mime)}
                />
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700">Название комнаты</label>
                  <input
                    type="text"
                    value={roomName}
                    maxLength={MAX_ROOM_NAME_LENGTH}
                    disabled={!canEdit}
                    onChange={(e) => {
                      setRoomName(e.target.value);
                      setNameSaved(false);
                    }}
                    placeholder={`Комната ${roomId}`}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
                  />
                  {canEdit && (
                    <button
                      type="button"
                      disabled={nameSaving}
                      onClick={() => void handleSaveName()}
                      className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {nameSaving ? "Сохранение…" : nameSaved ? "Сохранено" : "Сохранить название"}
                    </button>
                  )}
                  {!canEdit && (
                    <p className="text-[11px] text-gray-500">Изменять название и аватар могут только админы.</p>
                  )}
                </div>
              </section>

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

              <section className="rounded-xl border border-gray-200 bg-white p-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">Участники</p>
                <div className="space-y-2">
                  {(snapshot?.participants ?? []).map((p: RoomManageParticipant) => {
                    const role = p.role ?? "member";
                    const isOwner = role === "owner";
                    const disabled = busyPhone === p.phone;
                    const online = Boolean(p.online);
                    const inRoomNow = Boolean(p.inRoomNow);
                    return (
                      <div key={p.phone} className="rounded-lg border border-gray-100 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm text-gray-900">{p.phone}</p>
                            <p className="text-[11px] text-gray-500">role: {role}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  online ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {online ? "онлайн" : "офлайн"}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  inRoomNow ? "bg-sky-100 text-sky-700" : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {inRoomNow ? "в комнате сейчас" : "не в комнате сейчас"}
                              </span>
                            </div>
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
            </div>
            <section
              className="shrink-0 border-t border-gray-200 bg-white p-3 space-y-2"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
              <p className="text-xs font-semibold text-gray-700">Добавить по номеру телефона</p>
              <p className="text-[11px] text-gray-500">
                Без выпадающих списков: укажите номер вручную. Добавление только для active whitelist и зарегистрированных пользователей.
              </p>
              <div className="flex gap-2">
                <input
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  onFocus={(e) => {
                    requestAnimationFrame(() => {
                      e.currentTarget.scrollIntoView({ block: "center", behavior: "auto" });
                    });
                  }}
                  inputMode="tel"
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
          </div>
        )}
      </div>
    </MessengerShell>
  );
}
