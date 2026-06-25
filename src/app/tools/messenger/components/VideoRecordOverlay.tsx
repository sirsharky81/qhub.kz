"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatDurationMs,
  type MediaRecorderSession,
} from "@/lib/messenger/media-recorder";

const TRASH_SWIPE_PX = 100;

interface Props {
  session: MediaRecorderSession;
  onDiscard: () => void;
  onSend: () => void;
  error: string | null;
}

export function VideoRecordOverlay({ session, onDiscard, onSend, error }: Props) {
  const [elapsedMs, setElapsedMs] = useState(() => session.getElapsedMs());
  const [flipping, setFlipping] = useState(false);
  const [dragX, setDragX] = useState(0);
  const previewRef = useRef<HTMLVideoElement>(null);
  const dragStartX = useRef(0);
  const dragXRef = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedMs(session.getElapsedMs());
    }, 200);

    if (previewRef.current) {
      previewRef.current.srcObject = session.getStream();
      void previewRef.current.play().catch(() => {});
    }

    return () => clearInterval(timer);
  }, [session]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleFlip = useCallback(async () => {
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
  }, [session]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    dragStartX.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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

  const content = (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black"
      role="dialog"
      aria-label="Запись видеосообщения"
    >
      <div
        className="relative flex-1 min-h-0 touch-none select-none overflow-hidden"
        style={{ transform: dragX ? `translateX(${dragX}px)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <video
          ref={previewRef}
          muted
          playsInline
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/45 px-4 py-2 backdrop-blur-sm"
          style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white text-sm font-semibold tabular-nums tracking-wide">
            {formatDurationMs(elapsedMs)}
          </span>
        </div>

        {dragX < -20 && (
          <div
            className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 text-red-400 transition-opacity"
            style={{ opacity: Math.min(1, Math.abs(dragX) / TRASH_SWIPE_PX) }}
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" />
            </svg>
            <span className="text-xs font-medium">Удалить</span>
          </div>
        )}

        {error && (
          <p
            className="absolute left-4 right-4 text-center text-sm text-red-300 bg-black/50 rounded-xl px-3 py-2"
            style={{ top: "calc(max(0.75rem, env(safe-area-inset-top)) + 2.75rem)" }}
          >
            {error}
          </p>
        )}
      </div>

      <div
        className="shrink-0 flex items-center justify-between gap-3 px-5 pt-3 bg-black/90 backdrop-blur-md"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={onDiscard}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 touch-manipulation"
          aria-label="Удалить запись"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" />
          </svg>
        </button>

        <p className="text-xs text-white/50 text-center flex-1 hidden sm:block">
          Смахните влево для отмены
        </p>

        <button
          type="button"
          disabled={flipping}
          onClick={() => void handleFlip()}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-50 touch-manipulation"
          aria-label="Перевернуть камеру"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 19H4a2 2 0 01-2-2V7a2 2 0 012-2h5" strokeLinecap="round" />
            <path d="M13 5h7a2 2 0 012 2v10a2 2 0 01-2 2h-5" strokeLinecap="round" />
            <path d="M8 12h8M16 9l3 3-3 3M8 15l-3-3 3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onSend}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white hover:bg-sky-400 shadow-lg shadow-sky-500/30 touch-manipulation"
          aria-label="Отправить видео"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
            <path d="M3.4 20.4 21 12 3.4 3.6 3 11l8 1-8 1z" />
          </svg>
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
