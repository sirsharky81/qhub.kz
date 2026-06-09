"use client";

import type { ExportFormat } from "@/lib/music-editor/types";

interface ExportPanelProps {
  format: ExportFormat;
  onFormatChange: (format: ExportFormat) => void;
  onExport: () => void;
  exporting?: boolean;
  filename?: string;
  saveTargetLabel?: string;
  disabled?: boolean;
}

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "mp3-320", label: "MP3 320" },
  { value: "mp3-192", label: "MP3 192" },
  { value: "wav", label: "WAV" },
];

export function ExportPanel({
  format,
  onFormatChange,
  onExport,
  exporting = false,
  filename = "music",
  saveTargetLabel,
  disabled = false,
}: ExportPanelProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3 space-y-2 shadow-sm">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        Сохранить результат
      </p>

      {saveTargetLabel && (
        <p className="text-[11px] text-gray-600">
          Будет сохранено: <strong className="text-gray-900">{saveTargetLabel}</strong>
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {FORMATS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onFormatChange(f.value)}
            className={[
              "px-2.5 py-1 text-[11px] rounded-lg border font-medium transition-all",
              format === f.value
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onExport}
        disabled={exporting || disabled}
        className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 hover:bg-gray-700 text-white transition-colors disabled:opacity-50"
      >
        {exporting ? "Экспорт..." : `Скачать ${filename}`}
      </button>
    </div>
  );
}
