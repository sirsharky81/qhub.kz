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
            : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : low
            ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
            : "bg-black/10 text-zinc-800 dark:bg-white/10 dark:text-zinc-100"
      }`}
    >
      {text}
    </div>
  );
}
