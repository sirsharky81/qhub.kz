"use client";

import Link from "next/link";
import type { SpiderState } from "@/lib/games/spider/types";
import { SPIDER_SUIT_LABELS } from "../constants";

export function SpiderTopBar({
  state,
  elapsed,
  onUndo,
  onHint,
  onRestart,
  onOpenGameMenu,
  onRules,
  canUndo,
}: {
  state: SpiderState;
  elapsed: string;
  onUndo: () => void;
  onHint: () => void;
  onRestart: () => void;
  onOpenGameMenu: () => void;
  onRules: () => void;
  canUndo: boolean;
}) {
  return (
    <header className="rounded-2xl border border-gray-200/80 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 px-2 py-2 sm:px-4 sm:py-2.5 shadow-sm shrink-0 max-sm:landscape:rounded-xl max-sm:landscape:py-1 max-sm:landscape:px-1.5">
      <div className="flex items-center justify-between gap-2 min-w-0 max-sm:landscape:gap-1">
        <div className="flex items-center gap-2 min-w-0 max-sm:landscape:gap-1">
          <Link
            href="/tools/games"
            className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 shrink-0 py-1 max-sm:landscape:text-[10px] max-sm:landscape:py-0"
          >
            ← Игры
          </Link>
          <span className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 truncate max-sm:landscape:hidden">
            {SPIDER_SUIT_LABELS[state.suitMode]}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0 max-sm:landscape:gap-1.5">
          <Stat label="Время" value={elapsed} compact />
          <Stat label="Ходы" value={String(state.moves)} compact />
          <Stat label="Дом" value={`${state.completedRuns}/8`} accent compact />
        </div>
      </div>

      <div className="mt-2 -mx-1 px-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-sm:landscape:mt-1 max-sm:landscape:mx-0 max-sm:landscape:px-0">
        <div className="flex items-center gap-1.5 min-w-max pb-0.5 max-sm:landscape:gap-1 max-sm:landscape:pb-0">
          <ToolBtn onClick={onUndo} disabled={!canUndo} title="Отменить ход" short="↩" label="Отменить" compact />
          <ToolBtn onClick={onHint} title="Подсказка" short="💡" label="Подсказка" compact />
          <ToolBtn onClick={onRules} title="Правила" short="?" label="Правила" compact />
          <ToolBtn onClick={onRestart} title="Начать заново" short="🔄" label="Заново" compact />
          <ToolBtn
            onClick={onOpenGameMenu}
            title="Новая игра или смена сложности"
            short="☰"
            label="Новая"
            variant="accent"
            compact
          />
        </div>
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  accent,
  compact,
}: {
  label: string;
  value: string;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="text-right leading-none">
      <p className="text-[8px] sm:text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 max-sm:landscape:text-[7px]">
        {label}
      </p>
      <p
        className={`mt-0.5 font-bold tabular-nums max-sm:landscape:mt-0 max-sm:landscape:text-[10px] ${
          compact ? "text-xs sm:text-lg" : "text-sm sm:text-lg"
        } ${accent ? "text-emerald-700 dark:text-emerald-400" : "text-gray-900 dark:text-gray-100"}`}
      >
        {value}
      </p>
    </div>
  );
}

function ToolBtn({
  label,
  short,
  onClick,
  disabled,
  title,
  variant = "default",
  compact = false,
}: {
  label: string;
  short: string;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  variant?: "default" | "accent";
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className={`inline-flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] sm:text-xs font-medium transition touch-manipulation select-none ${
        compact
          ? "min-w-[44px] min-h-[44px] max-sm:landscape:min-w-[36px] max-sm:landscape:min-h-[36px] max-sm:landscape:px-1 max-sm:landscape:py-0.5 max-sm:landscape:rounded-lg"
          : "min-w-[52px] min-h-[52px]"
      } ${
        disabled
          ? "opacity-35 cursor-not-allowed text-gray-400"
          : variant === "accent"
            ? "text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 active:bg-emerald-100"
            : "text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/60 active:bg-gray-100 dark:active:bg-gray-800"
      }`}
    >
      <span className="text-base leading-none max-sm:landscape:text-sm" aria-hidden>
        {short}
      </span>
      <span className={`leading-none max-w-[56px] truncate ${compact ? "max-sm:landscape:hidden" : ""}`}>
        {label}
      </span>
    </button>
  );
}
