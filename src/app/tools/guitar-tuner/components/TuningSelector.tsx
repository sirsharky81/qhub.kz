"use client";

import type { TuningPreset } from "@/lib/guitar-tuner/tunings/types";

interface TuningSelectorProps {
  tunings: TuningPreset[];
  value: string;
  onChange: (id: string) => void;
}

export default function TuningSelector({ tunings, value, onChange }: TuningSelectorProps) {
  if (tunings.length <= 1) return null;

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {tunings.map((tuning) => (
        <button
          key={tuning.id}
          type="button"
          onClick={() => onChange(tuning.id)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            value === tuning.id
              ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
          }`}
        >
          {tuning.name}
        </button>
      ))}
    </div>
  );
}
