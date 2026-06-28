"use client";

import type { InstrumentDefinition } from "@/lib/guitar-tuner/tunings/types";

interface InstrumentSelectorProps {
  instruments: InstrumentDefinition[];
  value: string;
  onChange: (id: string) => void;
}

export default function InstrumentSelector({
  instruments,
  value,
  onChange,
}: InstrumentSelectorProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {instruments.map((inst) => (
        <button
          key={inst.id}
          type="button"
          onClick={() => onChange(inst.id)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            value === inst.id
              ? "bg-emerald-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          {inst.name}
        </button>
      ))}
    </div>
  );
}
