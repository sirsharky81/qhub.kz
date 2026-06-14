"use client";

import { formatFileSize } from "@/lib/file-converter/size-limits";

interface ResultPanelProps {
  filename: string;
  size: number;
  onDownload: () => void;
  onReset: () => void;
}

export function ResultPanel({ filename, size, onDownload, onReset }: ResultPanelProps) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-6 text-center shadow-sm">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xl font-bold">
        ✓
      </div>
      <p className="font-semibold text-gray-900">Обработка успешно завершена</p>
      <p className="text-sm text-gray-600 mt-1 truncate px-2">{filename}</p>
      <p className="text-xs text-gray-500 mt-0.5">{formatFileSize(size)}</p>
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onDownload}
          className="w-full py-3 rounded-xl text-sm font-semibold bg-gray-900 hover:bg-gray-800 text-white transition-colors shadow-sm touch-manipulation active:scale-[0.99]"
        >
          Скачать файл
        </button>
        <button
          type="button"
          onClick={onReset}
          className="w-full py-3 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 transition-colors touch-manipulation"
        >
          Конвертировать ещё
        </button>
      </div>
    </div>
  );
}
