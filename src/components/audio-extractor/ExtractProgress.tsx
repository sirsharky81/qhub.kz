"use client";

import { useAudioExtractorT } from "@/lib/audio-extractor/i18n";

interface ExtractProgressProps {
  percent: number | null;
  label?: string;
}

export function ExtractProgress({ percent, label }: ExtractProgressProps) {
  const { t } = useAudioExtractorT();
  const pct = percent ?? 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
      <p className="text-sm font-medium text-gray-900">{label ?? t("loadingAudio")}</p>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full bg-gray-900 transition-all duration-300"
          style={{ width: `${percent === null ? 35 : Math.max(8, Math.min(100, pct))}%` }}
        />
      </div>
      {percent !== null && (
        <p className="text-xs text-gray-500 text-right tabular-nums">{Math.round(pct)}%</p>
      )}
    </div>
  );
}
