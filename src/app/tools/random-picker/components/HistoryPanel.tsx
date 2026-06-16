"use client";

import type { VerificationRecord } from "@/lib/random-picker";
import { clearOperationHistory } from "@/lib/random-picker";

interface HistoryPanelProps {
  history: VerificationRecord[];
  onClear: () => void;
}

export function HistoryPanel({ history, onClear }: HistoryPanelProps) {
  if (history.length === 0) return null;

  const handleClear = () => {
    clearOperationHistory();
    onClear();
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          История операций
        </h3>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-red-500 hover:underline"
        >
          Очистить
        </button>
      </div>
      <ul className="space-y-3 max-h-64 overflow-y-auto">
        {history.map((h) => (
          <li
            key={h.id}
            className="text-xs border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0"
          >
            <div className="flex justify-between text-gray-500 dark:text-gray-400">
              <span>
                {h.date} {h.time}
              </span>
              <span>{h.participantCount} уч.</span>
            </div>
            <p className="font-medium text-gray-900 dark:text-gray-100 truncate mt-0.5">
              {h.result.split("\n")[0]}
            </p>
            <p className="font-mono text-gray-400 truncate">{h.verificationHash.slice(0, 24)}…</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
