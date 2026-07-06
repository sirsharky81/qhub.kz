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
    <header className="rounded-2xl border border-gray-200/80 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 px-2 py-2 sm:px-4 sm:py-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/tools/games"
            className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 shrink-0 py-1"
          >
            ← Игры
          </Link>
          <span className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
            {SPIDER_SUIT_LABELS[state.suitMode]}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <Stat label="Время" value={elapsed} compact />
          <Stat label="Ходы" value={String(state.moves)} compact />
          <Stat label="Дом" value={`${state.completedRuns}/8`} accent compact />
        </div>
      </div>

      <div className="mt-2 -mx-1 px-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center gap-1.5 min-w-max pb-0.5">
          <ToolBtn onClick={onUndo} disabled={!canUndo} title="Отменить ход" short="↩" label="Отменить" />
          <ToolBtn onClick={onHint} title="Подсказка" short="💡" label="Подсказка" />
          <ToolBtn onClick={onRules} title="Правила" short="?" label="Правила" />
          <ToolBtn onClick={onRestart} title="Начать заново" short="🔄" label="Заново" />
          <ToolBtn
            onClick={onOpenGameMenu}
            title="Новая игра или смена сложности"
            short="☰"
            label="Новая"
            variant="accent"
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
      <p className="text-[8px] sm:text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </p>
      <p
        className={`mt-0.5 font-bold tabular-nums ${
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
}: {
  label: string;
  short: string;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  variant?: "default" | "accent";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className={`inline-flex flex-col items-center justify-center gap-0.5 rounded-xl min-w-[52px] min-h-[52px] px-2 py-1.5 text-[10px] sm:text-xs font-medium transition touch-manipulation select-none ${
        disabled
          ? "opacity-35 cursor-not-allowed text-gray-400"
          : variant === "accent"
            ? "text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 active:bg-emerald-100"
            : "text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/60 active:bg-gray-100 dark:active:bg-gray-800"
      }`}
    >
      <span className="text-base leading-none" aria-hidden>
        {short}
      </span>
      <span className="leading-none max-w-[56px] truncate">{label}</span>
    </button>
  );
}
