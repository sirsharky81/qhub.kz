"use client";

import type { TuningString } from "@/lib/guitar-tuner/tunings/types";

interface StringSelectorProps {
  strings: TuningString[];
  selectedIndex: number | null;
  activeNote: string | null;
  onSelect: (index: number | null) => void;
}

export default function StringSelector({
  strings,
  selectedIndex,
  activeNote,
  onSelect,
}: StringSelectorProps) {
  if (strings.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {strings.map((s, i) => {
        const isSelected = selectedIndex === i;
        const isActive = activeNote?.startsWith(s.name.replace(/\d/, "")) ?? false;
        return (
          <button
            key={s.name}
            type="button"
            onClick={() => onSelect(isSelected ? null : i)}
            className={`min-w-[3rem] rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              isSelected
                ? "bg-emerald-600 text-white ring-2 ring-emerald-300"
                : isActive
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
