"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createRemotePlayerController,
  getCastSenderSupport,
  getCastStateLabel,
  getCastUnsupportedMessage,
  initCastSdk,
  loadMediaOnCast,
  type CastSenderSupport,
} from "@/lib/cast/cast-sdk";
import type { CastResolvedMedia } from "@/lib/cast/types";
import { isCastEnabled } from "@/lib/cast/urls";

interface Props {
  media: CastResolvedMedia;
  onError?: (message: string) => void;
}

export function CastRemoteControls({ media, onError }: Props) {
  const [support] = useState<CastSenderSupport>(() => getCastSenderSupport());
  const [castReady, setCastReady] = useState(false);
  const [castState, setCastState] = useState("NOT_CONNECTED");
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initTried, setInitTried] = useState(false);

  useEffect(() => {
    if (!isCastEnabled() || !support.ok) {
      setInitTried(true);
      return;
    }

    let instance: cast.framework.CastContext | null = null;
    const onState = () => {
      if (instance) setCastState(String(instance.getCastState()));
    };

    let cancelled = false;
    void initCastSdk().then((ready) => {
      if (cancelled) return;
      setInitTried(true);
      if (!ready || !window.cast?.framework) return;
      setCastReady(true);
      instance = window.cast.framework.CastContext.getInstance();
      onState();
      instance.addEventListener(window.cast.framework.CastContextEventType.CAST_STATE_CHANGED, onState);
    });

    return () => {
      cancelled = true;
      if (instance) {
        instance.removeEventListener(
          window.cast!.framework.CastContextEventType.CAST_STATE_CHANGED,
          onState,
        );
      }
    };
  }, [support]);

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
    return <p className="text-xs text-gray-500">Cast отключён на этом сервере.</p>;
  }

  if (!support.ok) {
    return (
      <div className="space-y-2 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900">
        <p className="font-medium">Cast на TV с этого устройства недоступен</p>
        <p className="text-xs leading-relaxed text-amber-800">
          {getCastUnsupportedMessage(support.reason)}
        </p>
        <CopyWatchLinkButton />
      </div>
    );
  }

  if (initTried && !castReady) {
    return (
      <div className="space-y-2 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900">
        <p className="font-medium">Cast SDK не загрузился</p>
        <p className="text-xs leading-relaxed text-amber-800">
          Откройте страницу в Chrome или Edge (не PWA с домашнего экрана), в одной Wi‑Fi с Mi Stick /
          Chromecast.
        </p>
        <CopyWatchLinkButton />
      </div>
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
          {!castReady ? "Подготовка Cast…" : loading ? "Отправка…" : "Cast на TV"}
        </button>
      </div>
      <p className="text-xs text-gray-500">{getCastStateLabel(castState)}</p>
      {remoteConnected && (
        <p className="text-xs text-emerald-600">Воспроизведение на TV. Этот экран — пульт.</p>
      )}
      <CopyWatchLinkButton />
      <p className="text-xs text-gray-400">
        Cast: Chrome / Edge / Opera на Android или ПК. iPhone — откройте ссылку на Android/ноутбуке.
      </p>
    </div>
  );
}

function CopyWatchLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-xs text-violet-700 underline underline-offset-2"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          /* ignore */
        }
      }}
    >
      {copied ? "Ссылка скопирована" : "Скопировать ссылку для Cast с другого устройства"}
    </button>
  );
}
