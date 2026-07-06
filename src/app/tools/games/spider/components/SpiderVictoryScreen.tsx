"use client";

import type { SpiderSuitMode } from "@/lib/games/spider/types";
import { SPIDER_SUIT_LABELS } from "../constants";

export function SpiderVictoryScreen({
  elapsed,
  moves,
  suitMode,
  onPlayAgain,
  onChangeDifficulty,
}: {
  elapsed: string;
  moves: number;
  suitMode: SpiderSuitMode;
  onPlayAgain: () => void;
  onChangeDifficulty: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-emerald-200/60 dark:border-emerald-800 bg-gradient-to-br from-white via-emerald-50 to-white dark:from-gray-900 dark:via-emerald-950/40 dark:to-gray-900 p-6 sm:p-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl animate-in fade-in zoom-in-95 duration-300"
        role="dialog"
        aria-labelledby="spider-victory-title"
      >
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-3xl mb-4">
            🎉
          </div>
          <h2
            id="spider-victory-title"
            className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-50"
          >
            Поздравляем!
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Вы собрали все 8 последовательностей
          </p>
        </div>

        <dl className="mt-6 space-y-3 rounded-2xl bg-white/70 dark:bg-gray-800/50 p-4 border border-gray-100 dark:border-gray-700">
          <Row label="Время" value={elapsed} />
          <Row label="Ходов" value={String(moves)} />
          <Row label="Сложность" value={SPIDER_SUIT_LABELS[suitMode]} />
        </dl>

        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={onPlayAgain}
            className="w-full rounded-xl bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white text-base font-semibold py-3.5 min-h-[48px] shadow-lg shadow-emerald-900/20 transition touch-manipulation"
          >
            Сыграть ещё
          </button>
          <button
            type="button"
            onClick={onChangeDifficulty}
            className="w-full rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium py-3 min-h-[44px] hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 transition touch-manipulation"
          >
            Другая сложность
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-sm text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
        {value}
      </dd>
    </div>
  );
}

export function SpiderStuckBanner({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="rounded-xl px-4 py-2.5 text-sm font-medium bg-white/95 text-amber-900 border border-amber-200 flex flex-wrap items-center justify-between gap-2 shadow-sm">
      <span>Ходов больше нет</span>
      <button type="button" onClick={onRestart} className="underline font-semibold">
        Начать заново
      </button>
    </div>
  );
}
