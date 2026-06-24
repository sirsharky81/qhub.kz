"use client";

import { useState } from "react";
import { parseRoomJoinUrl } from "@/lib/messenger/crypto";
import { setMessengerRoomKey } from "@/lib/family/messenger-room-keys";
import { linkMessengerRoomApi } from "@/lib/family/client";
import type { FamilySession } from "@/lib/family/types";

interface Props {
  session: FamilySession;
  messengerRoomId?: string | null;
  onLinked: (roomId: string | null) => void;
}

export function MessengerLink({ session, messengerRoomId, onLinked }: Props) {
  const [roomId, setRoomId] = useState(messengerRoomId ?? "");
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    const rid = roomId.trim().toUpperCase();
    if (!rid) {
      setError("Введите код комнаты мессенджера");
      return;
    }
    let key = keyInput.trim();
    if (!key && typeof window !== "undefined" && window.location.hash.startsWith("#key=")) {
      key = decodeURIComponent(window.location.hash.slice(5));
    }
    if (!key) {
      setError("Нужен ключ шифрования из QR мессенджера");
      return;
    }

    setSaving(true);
    try {
      setMessengerRoomKey(rid, key);
      await linkMessengerRoomApi(session, rid);
      onLinked(rid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка привязки");
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlink() {
    setSaving(true);
    try {
      await linkMessengerRoomApi(session, null);
      onLinked(null);
      setRoomId("");
      setKeyInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  function handlePasteUrl() {
    void navigator.clipboard.readText().then((text) => {
      const parsed = parseRoomJoinUrl(text);
      if (parsed.code) setRoomId(parsed.code.toUpperCase());
      if (parsed.key) setKeyInput(parsed.key);
    });
  }

  if (messengerRoomId) {
    return (
      <div className="rounded-xl border border-gray-200 p-4 space-y-2">
        <p className="text-sm font-medium">Messenger: комната {messengerRoomId}</p>
        <p className="text-xs text-gray-500">SOS будет дублироваться в чат этой комнаты.</p>
        <button
          type="button"
          onClick={handleUnlink}
          disabled={saving}
          className="text-sm text-red-600 underline"
        >
          Отвязать
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-3">
      <p className="text-sm font-medium">Привязать Messenger-комнату для SOS</p>
      <input
        value={roomId}
        onChange={(e) => setRoomId(e.target.value.toUpperCase())}
        placeholder="Код комнаты"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      <input
        value={keyInput}
        onChange={(e) => setKeyInput(e.target.value)}
        placeholder="Ключ из QR (#key=…)"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono text-xs"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handlePasteUrl}
          className="text-xs text-sky-600 underline"
        >
          Вставить ссылку
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-xl bg-gray-900 text-white py-2 text-sm font-semibold disabled:opacity-50"
      >
        {saving ? "Сохранение…" : "Привязать"}
      </button>
    </div>
  );
}
