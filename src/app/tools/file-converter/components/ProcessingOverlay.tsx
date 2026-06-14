"use client";

import type { ProcessProgress } from "@/lib/file-converter/types";

interface ProcessingOverlayProps {
  progress: ProcessProgress;
  onCancel: () => void;
}

export function ProcessingOverlay({ progress, onCancel }: ProcessingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-[2px] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 sm:p-6 shadow-xl border border-gray-200">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
          <p className="font-semibold text-gray-900">Обработка…</p>
        </div>
        <p className="text-sm text-gray-600 mb-3 min-h-[1.25rem]">{progress.message}</p>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-gray-900 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, progress.percent)}%` }}
          />
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors touch-manipulation"
        >
          Отменить
        </button>
      </div>
    </div>
  );
}
