"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SecurityBadge } from "./SecurityBadge";

const FEATURE_KEYS = [
  "emptyState.feature1",
  "emptyState.feature2",
  "emptyState.feature3",
  "emptyState.feature4",
  "emptyState.feature5",
] as const;

interface SharedUploadZoneProps {
  onFileSelect: (files: FileList | File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  hasPages?: boolean;
}

export function SharedUploadZone({
  onFileSelect,
  accept = "application/pdf,.pdf",
  multiple = false,
  disabled = false,
  hasPages = false,
}: SharedUploadZoneProps) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | File[] | null) => {
      if (!files || files.length === 0 || disabled) return;
      onFileSelect(files);
    },
    [disabled, onFileSelect],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (hasPages) {
    return (
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`border-2 border-dashed rounded-xl p-4 text-center transition-colors ${
          isDragging ? "border-gray-900 bg-gray-50" : "border-gray-200"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2 disabled:opacity-50"
        >
          {t("upload.addMore")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-8 sm:py-12">
      <div className="w-full max-w-xl mx-auto text-center space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            {t("upload.title")}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-500">{t("upload.hint")}</p>
        </div>

        <ul className="text-left space-y-2.5 bg-gray-50 border border-gray-100 rounded-2xl p-5">
          {FEATURE_KEYS.map((key) => (
            <li key={key} className="flex items-start gap-2.5 text-sm text-gray-700">
              <span className="text-emerald-600 font-bold mt-0.5" aria-hidden>
                ✓
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 transition-colors ${
            isDragging
              ? "border-gray-900 bg-gray-50"
              : "border-gray-300 hover:border-gray-400"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <p className="text-sm text-gray-500 mb-4">{t("upload.dropHint")}</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 hover:bg-gray-700 text-white transition-colors shadow-sm disabled:opacity-50"
          >
            {t("upload.selectFile")}
          </button>
        </div>

        <SecurityBadge />
      </div>
    </div>
  );
}
