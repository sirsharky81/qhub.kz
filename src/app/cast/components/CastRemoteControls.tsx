"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createRemotePlayerController,
  getCastStateLabel,
  initCastSdk,
  loadMediaOnCast,
} from "@/lib/cast/cast-sdk";
import type { CastResolvedMedia } from "@/lib/cast/types";
import { isCastEnabled } from "@/lib/cast/urls";

interface Props {
  media: CastResolvedMedia;
  onError?: (message: string) => void;
}

export function CastRemoteControls({ media, onError }: Props) {
  const [castReady, setCastReady] = useState(false);
  const [castState, setCastState] = useState("NOT_CONNECTED");
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isCastEnabled()) return;
    void initCastSdk().then(setCastReady);

    const ctx = () => window.cast?.framework?.CastContext.getInstance();
    const onState = () => {
      const instance = ctx();
      if (instance) setCastState(String(instance.getCastState()));
    };

    const timer = window.setInterval(onState, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleCast = useCallback(async () => {
    setLoading(true);
    try {
      await loadMediaOnCast(media);
      const remote = createRemotePlayerController();
      setRemoteConnected(Boolean(remote?.player.isConnected));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Cast недоступен");
    } finally {
      setLoading(false);
    }
  }, [media, onError]);

  if (!isCastEnabled()) {
    return (
      <p className="text-xs text-gray-500">Cast отключён на этом сервере.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => void handleCast()}
          disabled={loading || !castReady}
          className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-violet-700"
        >
          <span aria-hidden>📺</span>
          {loading ? "Отправка…" : "Cast на TV"}
        </button>
      </div>
      <p className="text-xs text-gray-500">{getCastStateLabel(castState)}</p>
      {remoteConnected && (
        <p className="text-xs text-emerald-600">Воспроизведение на TV. Этот экран — пульт.</p>
      )}
      <p className="text-xs text-gray-400">
        Cast работает в Chrome, Edge и Opera. YouTube — через приложение YouTube на TV.
      </p>
    </div>
  );
}
