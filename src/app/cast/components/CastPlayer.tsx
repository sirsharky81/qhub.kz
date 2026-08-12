"use client";

import { useEffect, useRef, useState } from "react";
import type { CastResolvedMedia } from "@/lib/cast/types";

interface Props {
  media: CastResolvedMedia;
  className?: string;
}

export function CastPlayer({ media, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    setError(null);

    const onVideoError = () => {
      const code = video.error?.code;
      const detail =
        code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? "Формат не поддерживается этим устройством"
          : code === MediaError.MEDIA_ERR_NETWORK
            ? "Ошибка сети при загрузке видео"
            : code === MediaError.MEDIA_ERR_DECODE
              ? "Не удалось декодировать видео"
              : "Не удалось воспроизвести видео";
      setError(detail);
    };
    video.addEventListener("error", onVideoError);

    async function attach() {
      hlsRef.current?.destroy();
      hlsRef.current = null;

      const isHls =
        media.contentType.includes("mpegURL") ||
        media.streamUrl.split("?")[0]?.toLowerCase().endsWith(".m3u8");

      if (isHls) {
        try {
          const Hls = (await import("hls.js")).default;
          if (cancelled || !video) return;
          if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true });
            hlsRef.current = hls;
            hls.loadSource(media.streamUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, (_ev, data) => {
              if (data.fatal) setError("Не удалось воспроизвести HLS-поток");
            });
            return;
          }
        } catch {
          /* fall through to native */
        }
      }

      if (!video || cancelled) return;
      video.src = media.streamUrl;
      video.load();
    }

    void attach();

    return () => {
      cancelled = true;
      video.removeEventListener("error", onVideoError);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [media.contentType, media.streamUrl]);

  return (
    <div className={className}>
      <video
        ref={videoRef}
        className="w-full aspect-video bg-black rounded-lg"
        controls
        playsInline
        preload="metadata"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
