"use client";

import { useState } from "react";
import type { OcrLanguage } from "@/lib/document-scanner/ocr-export";
import { OCR_LANGUAGE_OPTIONS } from "@/lib/document-scanner/ocr-export";
import { footerActions, footerBar, footerBtnBack, footerBtnNext } from "./ScannerIcons";

interface Props {
  pageCount?: number;
  singlePage?: boolean;
  onConfirm: (language: OcrLanguage) => void;
  onClose: () => void;
  exporting?: boolean;
}

export default function OcrDialog({
  pageCount,
  singlePage = false,
  onConfirm,
  onClose,
  exporting,
}: Props) {
  const [language, setLanguage] = useState<OcrLanguage>("auto");

  const subtitle = singlePage
    ? "1 фото"
    : pageCount != null
      ? `${pageCount} стр.`
      : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Распознать текст</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>

        <div className="px-5 py-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            Язык
          </label>
          <div className="space-y-1 rounded-xl border border-gray-200 bg-gray-50 p-2">
            {OCR_LANGUAGE_OPTIONS.map((option) => (
              <label
                key={option.id}
                className="flex items-start gap-2 py-1.5 px-2 cursor-pointer text-sm text-gray-700 rounded-lg hover:bg-white"
              >
                <input
                  type="radio"
                  name="ocr-language"
                  checked={language === option.id}
                  onChange={() => setLanguage(option.id)}
                  className="accent-gray-900 mt-0.5"
                />
                <span>
                  <span className="block">{option.label}</span>
                  {option.hint && (
                    <span className="block text-[11px] text-gray-400 mt-0.5">{option.hint}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            При первом запуске загружаются языковые данные (~15–30 МБ).
          </p>
        </div>

        <div className={footerBar("px-5")}>
          <div className={footerActions()}>
            <button type="button" onClick={onClose} disabled={exporting} className={footerBtnBack()}>
              Отмена
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={() => onConfirm(language)}
              className={footerBtnNext()}
            >
              {exporting ? "Распознавание…" : "В Word"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
