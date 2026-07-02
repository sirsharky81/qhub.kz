"use client";

import { CallStatusText } from "./CallStatusText";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  peerTitle: string;
  phase: string;
  durationSec: number;
  muted: boolean;
  errorMessage?: string | null;
  onToggleMute: () => void;
  onHangup: () => void;
}

export function ActiveCallBar({
  peerTitle,
  phase,
  durationSec,
  muted,
  errorMessage,
  onToggleMute,
  onHangup,
}: Props) {
  const showDuration = phase === "active";

  return (
    <div
      className="fixed left-0 right-0 z-40 mx-auto max-w-2xl px-4"
      style={{ top: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <div className="rounded-2xl bg-gray-900 text-white shadow-lg px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{peerTitle}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <CallStatusText phase={phase} errorMessage={errorMessage} />
            {showDuration && (
              <span className="text-xs text-gray-400">{formatDuration(durationSec)}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleMute}
          className={`h-10 w-10 rounded-full flex items-center justify-center text-sm ${
            muted ? "bg-red-500/80" : "bg-white/15 hover:bg-white/25"
          }`}
          aria-label={muted ? "Включить микрофон" : "Выключить микрофон"}
        >
          {muted ? "🔇" : "🎤"}
        </button>
        <button
          type="button"
          onClick={onHangup}
          className="h-10 w-10 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center"
          aria-label="Завершить звонок"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
