"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { consumeScanResult } from "@/lib/code-scanner/scan-return";
import { createShareRoomApi, joinShareRoomApi } from "@/lib/share/client";
import { getDeviceName } from "@/lib/share/device-name";
import { saveShareSession } from "@/lib/share/session";
import { isShareInviteUrl, parseShareInviteFromUrl } from "@/lib/share/urls";
import { ShareShell } from "./components/ShareShell";

export function ShareHomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("t");
    if (token) {
      void autoJoin(token);
      return;
    }

    const scanKey = searchParams.get("scanKey");
    if (scanKey) {
      const raw = consumeScanResult(scanKey);
      if (raw) {
        const invite = isShareInviteUrl(raw) ? parseShareInviteFromUrl(raw) : raw.trim();
        if (invite) {
          setJoinInput(invite);
          void autoJoin(invite);
        }
      }
    }
  }, [searchParams]);

  async function autoJoin(input: string) {
    setBusy(true);
    setError(null);
    try {
      const deviceName = await getDeviceName();
      const session = await joinShareRoomApi(input, deviceName);
      saveShareSession(session);
      router.replace("/share/room");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка подключения");
      setBusy(false);
    }
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const deviceName = await getDeviceName();
      const session = await createShareRoomApi(deviceName);
      saveShareSession(session);
      router.push("/share/room");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setBusy(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const input = joinInput.trim();
    if (!input) return;

    let resolved = input;
    if (isShareInviteUrl(input)) {
      const token = parseShareInviteFromUrl(input);
      if (token) resolved = token;
    }

    await autoJoin(resolved);
  }

  return (
    <ShareShell title="QHub Share" subtitle="Мгновенный обмен файлами">
      <div className="p-4 space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">
          Передача файлов напрямую между устройствами через браузер. Без регистрации и без хранения на
          сервере.
        </p>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleCreate()}
          className="w-full rounded-xl bg-sky-600 text-white py-3 text-sm font-semibold disabled:opacity-50"
        >
          Создать комнату
        </button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-white px-2 text-xs text-gray-500">или</span>
          </div>
        </div>

        <form onSubmit={(e) => void handleJoin(e)} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Код или ссылка</span>
            <input
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="K8QX-3M7N или ссылка"
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm"
              disabled={busy}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !joinInput.trim()}
            className="w-full rounded-xl border border-gray-900 text-gray-900 py-3 text-sm font-semibold disabled:opacity-50"
          >
            Подключиться
          </button>
        </form>
      </div>
    </ShareShell>
  );
}
