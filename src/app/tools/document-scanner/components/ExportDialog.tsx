"use client";

import { useState } from "react";
import type { ExportFormat, ExportQuality } from "@/lib/document-scanner/types";
import { defaultScanFilename } from "@/lib/document-scanner/constants";
import { footerActions, footerBar, footerBtnBack, footerBtnNext } from "./ScannerIcons";

interface Props {
  pageCount: number;
  onExport: (settings: {
    filename: string;
    formats: ExportFormat[];
    quality: ExportQuality;
  }) => void;
  onClose: () => void;
  exporting?: boolean;
}

const QUALITY_OPTIONS: { id: ExportQuality; label: string }[] = [
  { id: "high", label: "Высокое качество" },
  { id: "medium", label: "Среднее качество" },
  { id: "low", label: "Минимальный размер" },
];

export default function ExportDialog({ pageCount, onExport, onClose, exporting }: Props) {
  const [filename, setFilename] = useState(defaultScanFilename());
  const [formats, setFormats] = useState<ExportFormat[]>(["pdf"]);
  const [quality, setQuality] = useState<ExportQuality>("high");

  function toggleFormat(f: ExportFormat) {
    if (f === "pdf") {
      setFormats((prev) => (prev.includes("pdf") ? prev.filter((x) => x !== "pdf") : ["pdf", ...prev]));
      return;
    }
    setFormats((prev) => {
      const next = prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f];
      return next.length === 0 ? ["pdf"] : next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Сохранить</h2>
          <p className="text-xs text-gray-500 mt-0.5">{pageCount} стр.</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Название файла
            </label>
            <input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Формат
            </label>
            <div className="flex flex-wrap gap-2">
              {(["pdf", "jpg", "png", "webp"] as ExportFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleFormat(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium uppercase border transition-colors ${
                    formats.includes(f)
                      ? "bg-gray-900 text-white border-transparent"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            {pageCount > 1 && formats.some((f) => f !== "pdf") && (
              <p className="text-[11px] text-gray-400 mt-1.5">
                Изображения экспортируются как отдельные файлы (ZIP)
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Качество
            </label>
            <div className="space-y-1 rounded-xl border border-gray-200 bg-gray-50 p-2">
              {QUALITY_OPTIONS.map((q) => (
                <label
                  key={q.id}
                  className="flex items-center gap-2 py-1.5 px-2 cursor-pointer text-sm text-gray-700 rounded-lg hover:bg-white"
                >
                  <input
                    type="radio"
                    name="quality"
                    checked={quality === q.id}
                    onChange={() => setQuality(q.id)}
                    className="accent-gray-900"
                  />
                  {q.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className={footerBar("px-5")}>
          <div className={footerActions()}>
            <button type="button" onClick={onClose} disabled={exporting} className={footerBtnBack()}>
              Отмена
            </button>
            <button
              type="button"
              disabled={exporting || !filename.trim()}
              onClick={() =>
                onExport({
                  filename: filename.trim(),
                  formats: formats.includes("pdf") ? formats : ["pdf", ...formats],
                  quality,
                })
              }
              className={footerBtnNext()}
            >
              {exporting ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
