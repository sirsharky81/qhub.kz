"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { generatePwaIcons } from "@/lib/file-converter/engines/pwa-icon-engine";
import { downloadZip } from "@/lib/file-converter/download";
import { mapErrorToUserMessage } from "@/lib/file-converter/errors";
import type { ProcessProgress } from "@/lib/file-converter/types";
import { ProcessingOverlay } from "./ProcessingOverlay";
import { PrivacyBanner } from "./PrivacyBanner";

export function PwaIconGenerator() {
  const inputId = useId();
  const isCoarse = useCoarsePointer();
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ProcessProgress>({ stage: "", percent: 0, message: "" });
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setProcessing(true);
    setProgress({ stage: "start", percent: 0, message: "Запуск…" });

    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreview(url);

    try {
      const result = await generatePwaIcons(file, setProgress);
      await downloadZip(result.files, "pwa-icons.zip");
    } catch (err) {
      setError(mapErrorToUserMessage(err));
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
        previewRef.current = null;
      }
      setPreview(null);
    } finally {
      setProcessing(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-2 font-mono">
          PWA
        </p>
        <h2 className="text-lg font-semibold text-gray-900">Генератор иконок</h2>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
          Загрузите PNG 1024×1024 — получите zip с favicon, icon-192/512, apple-touch-icon,
          maskable и manifest.json.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm text-center">
        <input
          id={inputId}
          type="file"
          accept="image/png,.png"
          className="sr-only"
          onChange={handleInputChange}
        />

        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Превью иконки"
            className="mx-auto w-28 h-28 sm:w-32 sm:h-32 rounded-2xl object-cover border border-gray-200 shadow-sm mb-4"
          />
        ) : (
          <div className="w-28 h-28 sm:w-32 sm:h-32 mx-auto mb-4 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-3xl">
            📱
          </div>
        )}

        <p className="text-sm font-semibold text-gray-900">PNG 1024×1024</p>
        <p className="text-xs text-gray-500 mt-1 mb-4">Квадратное изображение без прозрачных полей по краям</p>

        <label
          htmlFor={inputId}
          className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-gray-900 hover:bg-gray-800 text-white transition-colors shadow-sm cursor-pointer touch-manipulation active:scale-[0.98] ${
            isCoarse ? "w-full" : ""
          }`}
        >
          {preview ? "Загрузить другую" : "Выбрать PNG"}
        </label>
      </div>

      <PrivacyBanner compact />

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          {error}
        </p>
      )}

      {processing && (
        <ProcessingOverlay progress={progress} onCancel={() => setProcessing(false)} />
      )}
    </div>
  );
}
