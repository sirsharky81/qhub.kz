"use client";

import type { DuplicateInfo } from "@/lib/random-picker";
import { formatDuplicateWarning } from "@/lib/random-picker";

interface DuplicateWarningProps {
  duplicates: DuplicateInfo[];
  onDedupe: () => void;
  onKeep: () => void;
}

export function DuplicateWarning({ duplicates, onDedupe, onKeep }: DuplicateWarningProps) {
  if (duplicates.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 space-y-3"
    >
      <p className="text-sm text-amber-900 dark:text-amber-100">
        ⚠ {formatDuplicateWarning(duplicates)}
      </p>
      <p className="text-xs text-amber-800 dark:text-amber-200">
        Удалить дубли автоматически?
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onDedupe}
          className="rounded-lg bg-amber-600 text-white text-sm px-3 py-1.5 hover:opacity-90"
        >
          Да, удалить
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="rounded-lg border border-amber-300 dark:border-amber-700 text-sm px-3 py-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/40"
        >
          Нет, оставить
        </button>
      </div>
    </div>
  );
}
