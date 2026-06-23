"use client";

import Link from "next/link";
import type { PickerMode, ModeConfig } from "@/lib/random-picker";
import { PICKER_MODES } from "@/lib/random-picker";

interface ModeGridProps {
  onSelect: (mode: PickerMode) => void;
  onComingSoon: (mode: ModeConfig) => void;
}

export function ModeGrid({ onSelect, onComingSoon }: ModeGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {PICKER_MODES.map((mode) => (
        <ModeCard
          key={mode.id}
          mode={mode}
          onSelect={() => {
            if (mode.comingSoon) onComingSoon(mode);
            else if (!mode.href) onSelect(mode.id);
          }}
        />
      ))}
    </div>
  );
}

function ModeCard({ mode, onSelect }: { mode: ModeConfig; onSelect: () => void }) {
  const className =
    "relative flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-3 text-left transition-all hover:border-gray-300 hover:shadow-sm active:scale-[0.99] touch-manipulation w-full";

  const content = (
    <>
      {mode.comingSoon && (
        <span className="absolute top-2 right-2 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">
          Скоро
        </span>
      )}
      <span className="text-lg shrink-0" aria-hidden>
        {mode.emoji}
      </span>
      <div className="min-w-0">
        <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100">
          {mode.title}
        </span>
        <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
          {mode.description}
        </span>
      </div>
    </>
  );

  if (mode.href) {
    return (
      <Link href={mode.href} className={className} aria-label={mode.title}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onSelect} aria-label={mode.comingSoon ? `${mode.title} — скоро` : mode.title} className={className}>
      {content}
    </button>
  );
}
