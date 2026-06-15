"use client";

import Image from "next/image";
import { useCallback, useId, useState } from "react";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { MAX_FILE_SIZE } from "@/lib/document-scanner/constants";
import { PrivacyBanner } from "../../file-converter/components/PrivacyBanner";
import {
  btnOutline,
  btnPrimary,
  btnSecondary,
  IconCamera,
  IconDocument,
  IconGallery,
  IconUpload,
} from "./ScannerIcons";

const SCANNER_ICON = "/tools/document-scanner/icon-192.png";

const CAPABILITY_PILLS = ["A4 PDF", "Автообрезка", "Печать", "Локально"] as const;

interface Props {
  onFileSelect: (file: File) => void;
  onCameraOpen: () => void;
  onGalleryOpen: () => void;
  savedDocs?: { id: string; name: string; pageCount: number; updatedAt: number }[];
  onOpenDoc?: (id: string) => void;
  onClearSavedDocs?: () => void;
}

export default function HomeScreen({
  onFileSelect,
  onCameraOpen,
  onGalleryOpen,
  savedDocs = [],
  onOpenDoc,
  onClearSavedDocs,
}: Props) {
  const isCoarse = useCoarsePointer();
  const inputId = useId();
  const galleryInputId = useId();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback((file: File): boolean => {
    if (!file.type.startsWith("image/") && !file.name.match(/\.(heic|heif)$/i)) {
      setError("Выберите изображение (JPG, PNG, HEIC и др.)");
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Файл слишком большой. Максимум 50 МБ.");
      return false;
    }
    setError(null);
    return true;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (validate(file)) onFileSelect(file);
    },
    [onFileSelect, validate],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  function formatDocDate(ts: number): string {
    return new Date(ts).toLocaleDateString("ru", { day: "numeric", month: "short" });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-4 py-5 sm:py-6 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-[22%] overflow-hidden shrink-0 border border-gray-200 bg-white shadow-sm">
              <Image src={SCANNER_ICON} alt="" width={40} height={40} className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 pt-0.5">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
                Сканер документов
              </h1>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                Загрузите фото или сделайте снимок — получите PDF формата A4 на устройстве.
              </p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              {error}
            </p>
          )}

          {isCoarse ? (
            <section className="rounded-2xl border border-gray-200 bg-gray-50 p-3 space-y-2">
              <button type="button" onClick={onCameraOpen} className={btnPrimary("w-full py-2.5")}>
                <IconCamera />
                Сделать снимок
              </button>
              <button type="button" onClick={onGalleryOpen} className={btnSecondary("w-full py-2.5")}>
                <IconGallery />
                Из медиатеки
              </button>
              <input
                id={galleryInputId}
                type="file"
                accept="image/*,.heic,.heif"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <label htmlFor={galleryInputId} className={btnOutline("w-full py-2 text-xs cursor-pointer")}>
                <IconUpload className="w-4 h-4" />
                Выбрать файл
              </label>
            </section>
          ) : (
            <section
              onDrop={onDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              className={`rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-colors bg-white ${
                dragging ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                id={inputId}
                type="file"
                accept="image/*,.heic,.heif"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gray-100 text-gray-600 mb-3">
                <IconUpload className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-gray-900">Перетащите изображение сюда</p>
              <p className="mt-1 text-xs text-gray-500">JPG, PNG, HEIC · до 50 МБ</p>
              <label htmlFor={inputId} className={btnPrimary("mt-4 px-5 py-2 cursor-pointer")}>
                Выбрать файл
              </label>
            </section>
          )}

          {savedDocs.length > 0 && onOpenDoc && (
            <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50/80">
                <h2 className="text-xs font-medium text-gray-500">
                  Недавние · {savedDocs.length}
                </h2>
                {onClearSavedDocs && (
                  <button
                    type="button"
                    onClick={onClearSavedDocs}
                    className="text-[11px] text-gray-400 hover:text-red-600 transition-colors"
                  >
                    Очистить
                  </button>
                )}
              </div>
              <ul className="divide-y divide-gray-100 max-h-[11.5rem] overflow-y-auto overscroll-contain">
                {savedDocs.map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => onOpenDoc(doc.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                    >
                      <div
                        className="w-7 h-9 rounded border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0 text-gray-400"
                        aria-hidden
                      >
                        <IconDocument className="w-3.5 h-3.5" />
                      </div>
                      <span className="min-w-0 flex-1 text-sm font-medium text-gray-900 truncate">
                        {doc.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-gray-400 tabular-nums">
                        {doc.pageCount} стр.
                        <span className="hidden sm:inline"> · {formatDocDate(doc.updatedAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <PrivacyBanner />

          <div className="flex flex-wrap justify-center gap-2 pt-1 text-[11px] text-gray-400">
            {CAPABILITY_PILLS.map((label) => (
              <span
                key={label}
                className="px-2 py-1 rounded-full border border-gray-100 bg-gray-50"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
