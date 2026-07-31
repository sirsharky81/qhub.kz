"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { consumeScanResult } from "@/lib/code-scanner/scan-return";
import {
  createShareRoomApi,
  fetchNearbyShareRoomsApi,
  joinShareRoomApi,
} from "@/lib/share/client";
import { getDeviceName } from "@/lib/share/device-name";
import { resolveShareJoinInput } from "@/lib/share/join-input";
import { hasPendingSharePayload, peekPendingText, peekPendingFilesCount } from "@/lib/share/pending-payload";
import { saveShareSession } from "@/lib/share/session";
import { isShareInviteUrl, parseShareInviteFromUrl } from "@/lib/share/urls";
import { ShareCreatePanel } from "./components/ShareCreatePanel";
import { ShareJoinPanel } from "./components/ShareJoinPanel";
import { ShareShell } from "./components/ShareShell";

export function ShareHomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [joinPin, setJoinPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nearby, setNearby] = useState<Awaited<ReturnType<typeof fetchNearbyShareRoomsApi>>>([]);
  const [nearbyLoading, setNearbyLoading] = useState(true);
  const [lanPrefer, setLanPrefer] = useState(true);

  const pendingHint = useMemo(() => {
    if (searchParams.get("pending") !== "1" && !hasPendingSharePayload()) return null;
    const fileCount = peekPendingFilesCount();
    const text = peekPendingText();
    if (fileCount > 0 && text) {
      return `Готово к отправке: ${fileCount} файл(ов) и текст. Подключитесь к комнате.`;
    }
    if (fileCount > 0) {
      return `Готово к отправке: ${fileCount} файл(ов). Подключитесь к комнате.`;
    }
    if (text) {
      return "Готово к отправке: текст или ссылка. Подключитесь к комнате.";
    }
    return null;
  }, [searchParams]);

  const joinRoom = useCallback(
    async (rawInput: string, pin?: string, options?: { lanPrefer?: boolean }) => {
      const resolved = resolveShareJoinInput(rawInput);
      if (!resolved) {
        setError("Введите код комнаты или ссылку");
        return;
      }

      setBusy(true);
      setError(null);
      try {
        const deviceName = await getDeviceName();
        const session = await joinShareRoomApi(resolved, deviceName, pin ?? joinPin);
        saveShareSession({ ...session, lanPrefer: options?.lanPrefer ?? lanPrefer });
        router.replace("/share/room");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка подключения");
        setBusy(false);
      }
    },
    [joinPin, lanPrefer, router],
  );

  useEffect(() => {
    void fetchNearbyShareRoomsApi()
      .then(setNearby)
      .finally(() => setNearbyLoading(false));
    const timer = setInterval(() => {
      void fetchNearbyShareRoomsApi().then(setNearby);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const token = searchParams.get("t");
    if (token) {
      queueMicrotask(() => void joinRoom(token));
      return;
    }

    const scanKey = searchParams.get("scanKey");
    if (scanKey) {
      const raw = consumeScanResult(scanKey);
      if (raw) {
        const invite = isShareInviteUrl(raw) ? parseShareInviteFromUrl(raw) ?? raw.trim() : raw.trim();
        if (invite) {
          queueMicrotask(() => {
            setJoinInput(invite);
            void joinRoom(invite);
          });
        }
      }
    }
  }, [searchParams, joinRoom]);

  async function handleCreate(pin?: string) {
    setBusy(true);
    setError(null);
    try {
      const deviceName = await getDeviceName();
      const session = await createShareRoomApi(deviceName, pin);
      saveShareSession({ ...session, lanPrefer });
      router.push("/share/room");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setBusy(false);
    }
  }

  return (
    <ShareShell title="QHub Share" subtitle="Мгновенный обмен файлами">
      <div className="p-4 space-y-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {pendingHint && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            {pendingHint}
          </div>
        )}

        <ShareJoinPanel
          joinInput={joinInput}
          joinPin={joinPin}
          busy={busy}
          nearbyRooms={nearby}
          nearbyLoading={nearbyLoading}
          lanPrefer={lanPrefer}
          onLanPreferChange={setLanPrefer}
          onJoinInputChange={setJoinInput}
          onJoinPinChange={setJoinPin}
          onJoin={() => void joinRoom(joinInput)}
          onNearbyJoin={(code) => {
            setJoinInput(code);
            void joinRoom(code, undefined, { lanPrefer: true });
          }}
        />

        <ShareCreatePanel busy={busy} onCreate={(pin) => void handleCreate(pin)} />
      </div>
    </ShareShell>
  );
}
