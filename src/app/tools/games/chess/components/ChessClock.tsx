"use client";

import { formatClock } from "@/lib/games/chess/clock";

export function ChessClock({ remainingMs, active }: { remainingMs: number; active: boolean }) {
  const low = remainingMs < 10_000;
  const text = formatClock(remainingMs);
  return (
    <div
      className={`min-w-[4.5rem] rounded-md px-2 py-1 text-right font-mono text-lg font-semibold tabular-nums leading-none ${
        active
          ? low
            ? "bg-red-600 text-white"
            : "bg-slate-900 text-white"
          : low
            ? "bg-red-100 text-red-700"
            : "bg-slate-200/80 text-slate-800"
      }`}
    >
      {text}
    </div>
  );
}
