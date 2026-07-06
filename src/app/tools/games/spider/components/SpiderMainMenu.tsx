"use client";

import type { SpiderSuitMode } from "@/lib/games/spider/types";
import { SPIDER_SUIT_LABELS } from "../constants";

const SUIT_MODE_LABELS: Record<SpiderSuitMode, { title: string; description: string }> = {
  1: { title: "1 масть", description: "Лёгкий — все карты одной масти" },
  2: { title: "2 масти", description: "Средний — пики и черви" },
  4: { title: "4 масти", description: "Сложный — все четыре масти" },
};

export function SpiderMainMenu({
  onStartGame,
  onShowRules,
  onResume,
  onQuit,
  pausedGame,
  stats,
}: {
  onStartGame: (suitMode: SpiderSuitMode) => void;
  onShowRules: () => void;
  onResume?: () => void;
  onQuit?: () => void;
  pausedGame?: { suitMode: SpiderSuitMode; moves: number; completedRuns: number } | null;
  stats: { games: number; wins: number; bestMoves: number | null; bestTimeSec: number | null };
}) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Пасьянс «Паук»</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            {pausedGame
              ? "Партия на паузе. Продолжите или начните новую."
              : "Соберите 8 последовательностей K→A одной масти."}
          </p>
        </div>
        <button
          type="button"
          onClick={onShowRules}
          className="shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 min-h-[44px] text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 touch-manipulation"
        >
          ? Правила
        </button>
      </div>

      {pausedGame && onResume && (
        <button
          type="button"
          onClick={onResume}
          className="w-full rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3.5 min-h-[52px] text-left hover:bg-emerald-100 dark:hover:bg-emerald-900/40 active:bg-emerald-200/60 transition touch-manipulation"
        >
          <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            ← Продолжить игру
          </span>
          <span className="mt-0.5 block text-xs text-emerald-800/80 dark:text-emerald-200/80">
            {SPIDER_SUIT_LABELS[pausedGame.suitMode]} · {pausedGame.moves} ходов ·{" "}
            {pausedGame.completedRuns}/8 собрано
          </span>
        </button>
      )}

      <div>
        <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500 font-semibold mb-2">
          {pausedGame ? "Или новая партия" : "Выберите сложность"}
        </p>
        <div className="space-y-2">
          {([1, 2, 4] as const).map((mode) => {
            const label = SUIT_MODE_LABELS[mode];
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onStartGame(mode)}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3.5 min-h-[52px] text-left hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 active:bg-gray-100 transition touch-manipulation"
              >
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label.title}</span>
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{label.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {stats.games > 0 && (
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2 text-xs text-gray-600 dark:text-gray-300 space-y-1">
          <p>
            Сыграно: {stats.games} · Побед: {stats.wins}
            {stats.games > 0 ? ` (${Math.round((stats.wins / stats.games) * 100)}%)` : ""}
          </p>
          {stats.bestMoves !== null && <p>Лучший результат: {stats.bestMoves} ходов</p>}
          {stats.bestTimeSec !== null && (
            <p>
              Лучшее время: {Math.floor(stats.bestTimeSec / 60)}:
              {String(stats.bestTimeSec % 60).padStart(2, "0")}
            </p>
          )}
        </div>
      )}

      {pausedGame && onQuit && (
        <button
          type="button"
          onClick={onQuit}
          className="w-full text-center text-xs text-red-600 dark:text-red-400 hover:underline py-1"
        >
          Завершить партию и выйти
        </button>
      )}
    </section>
  );
}
