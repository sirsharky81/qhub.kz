"use client";

import { useState } from "react";
import { postSosApi } from "@/lib/family/client";
import { getCurrentPosition } from "@/lib/family/geo";
import { readBatteryLevel } from "@/lib/family/battery";
import { loadChildSession } from "@/lib/family/session";
import { PlatformLocation } from "@/lib/platform/location";
import { isNativePlatform } from "@/lib/platform/runtime";
import type { FamilySession } from "@/lib/family/types";

interface Props {
  session: FamilySession;
  onSent?: () => void;
}

async function readCurrentCoords(): Promise<{ lat: number; lng: number; accuracy: number }> {
  if (isNativePlatform()) {
    const result = await PlatformLocation.getCurrentPosition();
    if (!result.ok) throw new Error(result.message || "Не удалось получить GPS");
    return {
      lat: result.value.lat,
      lng: result.value.lng,
      accuracy: result.value.accuracy,
    };
  }
  return getCurrentPosition();
}

export function SosSendCoordinatesButton({ session, onSent }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const s = loadChildSession();
    if (!s) return;

    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const coords = await readCurrentCoords();
      const battery = await readBatteryLevel();
      await postSosApi(s, { ...coords, battery });
      setMessage("SOS отправлен родителям");
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить SOS");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={loading}
        onClick={() => void handleSend()}
        className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-600 px-3 py-2.5 text-xs font-semibold text-white active:bg-red-700 disabled:opacity-60 touch-manipulation"
      >
        {loading ? "Отправка…" : "SOS — отправить координаты родителю"}
      </button>
      {message ? <p className="text-[11px] text-green-700 text-center">{message}</p> : null}
      {error ? <p className="text-[11px] text-red-600 text-center">{error}</p> : null}
    </div>
  );
}
