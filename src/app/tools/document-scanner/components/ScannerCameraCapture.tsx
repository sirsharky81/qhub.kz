"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export default function ScannerCameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setError("Не удалось открыть камеру. Разрешите доступ или загрузите фото из галереи.");
        }
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function takePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onCapture(new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.95,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <button
          type="button"
          onClick={onClose}
          className="text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-white/10"
        >
          Отмена
        </button>
        <p className="text-white text-sm font-medium">Сканирование</p>
        <div className="w-16" />
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <p className="text-red-400 text-sm text-center px-6">{error}</p>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="max-h-full max-w-full object-contain"
            aria-label="Предпросмотр камеры"
          />
        )}
      </div>

      <div className="flex flex-col items-center gap-3 px-4 py-6 bg-black/80">
        <p className="text-gray-400 text-xs text-center max-w-xs">
          Расположите документ в кадре. Система автоматически найдёт его границы.
        </p>
        <button
          type="button"
          onClick={takePhoto}
          disabled={!ready || !!error}
          className="w-16 h-16 rounded-full border-4 border-white bg-white/20 active:scale-95 transition-transform disabled:opacity-40"
          aria-label="Сделать снимок"
        />
      </div>
    </div>
  );
}
