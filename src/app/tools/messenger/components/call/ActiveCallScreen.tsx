"use client";

import { CallStatusText } from "./CallStatusText";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function peerInitial(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
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

export function ActiveCallScreen({
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
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-gray-900 via-gray-950 to-black text-white">
      <div
        className="flex flex-1 flex-col items-center justify-center px-6"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="h-28 w-28 rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/40 flex items-center justify-center text-4xl font-semibold text-emerald-100">
          {peerInitial(peerTitle)}
        </div>
        <h2 className="mt-6 text-3xl font-semibold text-center">{peerTitle}</h2>
        <div className="mt-3 flex flex-col items-center gap-1">
          <CallStatusText phase={phase} errorMessage={errorMessage} variant="dark" />
          {showDuration && (
            <span className="text-lg text-gray-300 tabular-nums">{formatDuration(durationSec)}</span>
          )}
        </div>
      </div>

      <div
        className="flex items-center justify-center gap-10 px-6 pb-10"
        style={{ paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={onToggleMute}
          className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl transition-colors ${
            muted ? "bg-red-500/90" : "bg-white/15 hover:bg-white/25"
          }`}
          aria-label={muted ? "Включить микрофон" : "Выключить микрофон"}
        >
          {muted ? "🔇" : "🎤"}
        </button>
        <button
          type="button"
          onClick={onHangup}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-3xl shadow-lg shadow-red-900/40 hover:bg-red-600"
          aria-label="Завершить звонок"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
