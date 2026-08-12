"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createRemotePlayerController,
  endCastSession,
  getCastDeviceName,
  getCastSenderSupport,
  getCastStateLabel,
  getCastUnsupportedMessage,
  initCastSdk,
  loadMediaOnCast,
  switchCastDevice,
  type CastSenderSupport,
} from "@/lib/cast/cast-sdk";
import type { CastResolvedMedia } from "@/lib/cast/types";
import { isCastEnabled } from "@/lib/cast/urls";

interface Props {
  media: CastResolvedMedia;
  onError?: (message: string | null) => void;
}

export function CastRemoteControls({ media, onError }: Props) {
  const [support] = useState<CastSenderSupport>(() => getCastSenderSupport());
  const [castReady, setCastReady] = useState(false);
  const [castState, setCastState] = useState("NOT_CONNECTED");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [mediaOnTv, setMediaOnTv] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initTried, setInitTried] = useState(false);

  const syncSessionUi = useCallback(() => {
    if (!window.cast?.framework) return;
    const ctx = window.cast.framework.CastContext.getInstance();
    const state = String(ctx.getCastState());
    setCastState(state);
    setDeviceName(getCastDeviceName());
    if (state !== "CONNECTED") {
      setMediaOnTv(false);
    }
  }, []);

  useEffect(() => {
    if (!isCastEnabled() || !support.ok) {
      setInitTried(true);
      return;
    }

    let instance: cast.framework.CastContext | null = null;
    const onState = () => syncSessionUi();

    let cancelled = false;
    void initCastSdk().then((ready) => {
      if (cancelled) return;
      setInitTried(true);
      if (!ready || !window.cast?.framework) return;
      setCastReady(true);
      instance = window.cast.framework.CastContext.getInstance();
      syncSessionUi();
      instance.addEventListener(window.cast.framework.CastContextEventType.CAST_STATE_CHANGED, onState);
      instance.addEventListener(
        window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
        onState,
      );
    });

    return () => {
      cancelled = true;
      if (instance) {
        instance.removeEventListener(
          window.cast!.framework.CastContextEventType.CAST_STATE_CHANGED,
          onState,
        );
        instance.removeEventListener(
          window.cast!.framework.CastContextEventType.SESSION_STATE_CHANGED,
          onState,
        );
      }
    };
  }, [support, syncSessionUi]);

  const connected = castState === "CONNECTED";

  const handleCast = useCallback(async () => {
    setLoading(true);
    onError?.(null);
    try {
      await loadMediaOnCast(media);
      const remote = createRemotePlayerController();
      setMediaOnTv(Boolean(remote?.player.isConnected));
      syncSessionUi();
    } catch (err) {
      setMediaOnTv(false);
      syncSessionUi();
      onError?.(err instanceof Error ? err.message : "Cast недоступен");
    } finally {
      setLoading(false);
    }
  }, [media, onError, syncSessionUi]);

  const handleDisconnect = useCallback(() => {
    try {
      endCastSession(true);
      setMediaOnTv(false);
      syncSessionUi();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Не удалось отключить");
    }
  }, [onError, syncSessionUi]);

  const handleSwitchDevice = useCallback(async () => {
    setLoading(true);
    try {
      setMediaOnTv(false);
      await switchCastDevice();
      await loadMediaOnCast(media);
      setMediaOnTv(true);
      syncSessionUi();
    } catch (err) {
      setMediaOnTv(false);
      syncSessionUi();
      onError?.(err instanceof Error ? err.message : "Не удалось сменить устройство");
    } finally {
      setLoading(false);
    }
  }, [media, onError, syncSessionUi]);

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
          {!castReady
            ? "Подготовка Cast…"
            : loading
              ? "Отправка…"
              : connected
                ? "Отправить снова"
                : "Cast на TV"}
        </button>
        {connected && (
          <>
            <button
              type="button"
              onClick={() => void handleSwitchDevice()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 disabled:opacity-50 hover:bg-gray-50"
            >
              Сменить устройство
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50 hover:bg-red-100"
            >
              Отключить
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-gray-500">
        {getCastStateLabel(castState)}
        {deviceName ? ` · ${deviceName}` : ""}
      </p>
      {mediaOnTv && connected && (
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
