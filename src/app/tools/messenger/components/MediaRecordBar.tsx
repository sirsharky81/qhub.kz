"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createMediaRecorderSession,
  formatDurationMs,
  type MediaRecorderSession,
  type MediaRecordMode,
} from "@/lib/messenger/media-recorder";

const TRASH_SWIPE_PX = 80;

interface Props {
  mode: MediaRecordMode;
  onDiscard: () => void;
  onSend: () => void;
  onSessionReady: (session: MediaRecorderSession) => void;
  error: string | null;
}

export function MediaRecordBar({ mode, onDiscard, onSend, onSessionReady, error }: Props) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const sessionRef = useRef<MediaRecorderSession | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const dragStartX = useRef(0);
  const dragXRef = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    void (async () => {
      try {
        const session = await createMediaRecorderSession({
          mode,
          onAutoStop: () => setElapsedMs(session.getElapsedMs()),
        });
        if (cancelled) {
          session.dispose();
          return;
        }
        sessionRef.current = session;
        await session.start();
        onSessionReady(session);

        if (mode === "video" && previewRef.current) {
          previewRef.current.srcObject = session.getStream();
          void previewRef.current.play().catch(() => {});
        }

        timer = setInterval(() => {
          setElapsedMs(session.getElapsedMs());
        }, 200);
      } catch {
        onDiscard();
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, [mode, onDiscard, onSessionReady]);

  const handleFlip = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || mode !== "video") return;
    setFlipping(true);
    try {
      await session.switchCamera();
      if (previewRef.current) {
        previewRef.current.srcObject = session.getStream();
        void previewRef.current.play().catch(() => {});
      }
    } finally {
      setFlipping(false);
    }
  }, [mode]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    dragStartX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStartX.current;
    dragXRef.current = Math.min(0, dx);
    setDragX(dragXRef.current);
  };

  const onPointerUp = () => {
    dragging.current = false;
    if (dragXRef.current <= -TRASH_SWIPE_PX) onDiscard();
    dragXRef.current = 0;
    setDragX(0);
  };

  return (
    <div className="relative flex items-center gap-2 min-w-0 w-full">
      <button
        type="button"
        onClick={onDiscard}
        className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-red-500 hover:bg-red-50"
        aria-label="Удалить запись"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" />
        </svg>
      </button>

      <div
        className="flex-1 min-w-0 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50/80 px-3 py-2 touch-none select-none"
        style={{ transform: dragX ? `translateX(${dragX}px)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" />
        {mode === "video" ? (
          <video
            ref={previewRef}
            muted
            playsInline
            className="h-12 w-16 rounded-lg object-cover bg-black shrink-0"
          />
        ) : (
          <div className="flex-1 flex items-end gap-0.5 h-8 min-w-0">
            {Array.from({ length: 20 }, (_, i) => (
              <div
                key={i}
                className="flex-1 bg-red-300/80 rounded-sm"
                style={{ height: `${20 + Math.abs(Math.sin(i + elapsedMs / 200)) * 80}%` }}
              />
            ))}
          </div>
        )}
        <span className="text-sm font-medium text-red-700 tabular-nums shrink-0">
          {formatDurationMs(elapsedMs)}
        </span>
      </div>

      {mode === "video" && (
        <button
          type="button"
          disabled={flipping}
          onClick={() => void handleFlip()}
          className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          aria-label="Перевернуть камеру"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 19H4a2 2 0 01-2-2V7a2 2 0 012-2h5" strokeLinecap="round" />
            <path d="M13 5h7a2 2 0 012 2v10a2 2 0 01-2 2h-5" strokeLinecap="round" />
            <path d="M8 12h8M16 9l3 3-3 3M8 15l-3-3 3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <button
        type="button"
        onClick={onSend}
        aria-label="Отправить запись"
        className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white hover:bg-sky-700"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M3.4 20.4 21 12 3.4 3.6 3 11l8 1-8 1z" />
        </svg>
      </button>

      {error && <p className="absolute -top-6 left-0 right-0 text-xs text-red-600 text-center">{error}</p>}
    </div>
  );
}
