"use client";

import { useCallback, useId, useState } from "react";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import {
  ACCEPT_DOCUMENT,
  ACCEPT_EBOOK,
  ACCEPT_IMAGE,
  ACCEPT_MEDIA,
  ACCEPT_SPREADSHEET,
  FILE_ACCEPT,
  isSupportedFile,
  SUPPORTED_FORMATS_HINT,
  unsupportedFileMessage,
} from "@/lib/file-converter/supported-formats";
import { PrivacyBanner } from "./PrivacyBanner";

interface ConverterUploadZoneProps {
  onFiles: (files: File[]) => void;
  onUnsupported?: (message: string) => void;
  disabled?: boolean;
  highlighted?: boolean;
  hint?: string;
  accept?: string;
}

export function ConverterUploadZone({
  onFiles,
  onUnsupported,
  disabled = false,
  highlighted = false,
  hint,
  accept = FILE_ACCEPT,
}: ConverterUploadZoneProps) {
  const isCoarse = useCoarsePointer();
  const imageInputId = useId();
  const mediaInputId = useId();
  const docInputId = useId();
  const bookInputId = useId();
  const allInputId = useId();
  const [dragging, setDragging] = useState(false);

  const processList = useCallback(
    (list: FileList | File[] | null) => {
      if (!list || list.length === 0 || disabled) return;
      const file = Array.from(list)[0];
      if (!file) return;

      if (!isSupportedFile(file)) {
        onUnsupported?.(unsupportedFileMessage(file));
        return;
      }

      onFiles([file]);
    },
    [disabled, onFiles, onUnsupported],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      processList(e.target.files);
      e.target.value = "";
    },
    [processList],
  );

  const baseInputProps = {
    type: "file" as const,
    className: "sr-only",
    disabled,
    onChange: handleInputChange,
  };

  if (isCoarse) {
    return (
      <section className="space-y-3">
        {hint && (
          <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-center">
            {hint}
          </p>
        )}

        <div
          className={`rounded-2xl border bg-white p-4 shadow-sm transition-colors ${
            highlighted ? "border-gray-900 ring-2 ring-gray-900/10" : "border-gray-200"
          }`}
        >
          <p className="text-sm font-semibold text-gray-900 mb-1">Загрузите файл</p>
          <p className="text-xs text-gray-500 mb-4 leading-relaxed">
            В каталоге устройства будут только поддерживаемые форматы
          </p>

          <div className="flex flex-col gap-2.5">
            <label
              htmlFor={imageInputId}
              className={`flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-gray-900 text-white text-sm font-semibold transition-colors active:scale-[0.98] ${
                disabled ? "opacity-50 pointer-events-none" : "cursor-pointer hover:bg-gray-800"
              }`}
            >
              <span aria-hidden>🖼️</span>
              Фото и изображения
            </label>

            <label
              htmlFor={mediaInputId}
              className={`flex items-center justify-center gap-2.5 py-3.5 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-800 text-sm font-semibold transition-colors active:scale-[0.98] ${
                disabled ? "opacity-50 pointer-events-none" : "cursor-pointer hover:border-gray-300 hover:bg-gray-100"
              }`}
            >
              <span aria-hidden>🎬</span>
              Видео и аудио
            </label>

            <label
              htmlFor={docInputId}
              className={`flex items-center justify-center gap-2.5 py-3.5 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-800 text-sm font-semibold transition-colors active:scale-[0.98] ${
                disabled ? "opacity-50 pointer-events-none" : "cursor-pointer hover:border-gray-300 hover:bg-gray-100"
              }`}
            >
              <span aria-hidden>📄</span>
              PDF и таблицы
            </label>

            <label
              htmlFor={bookInputId}
              className={`flex items-center justify-center gap-2.5 py-3.5 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-800 text-sm font-semibold transition-colors active:scale-[0.98] ${
                disabled ? "opacity-50 pointer-events-none" : "cursor-pointer hover:border-gray-300 hover:bg-gray-100"
              }`}
            >
              <span aria-hidden>📚</span>
              Книги
            </label>
          </div>

          <input {...baseInputProps} id={imageInputId} accept={ACCEPT_IMAGE} />
          <input {...baseInputProps} id={mediaInputId} accept={ACCEPT_MEDIA} />
          <input
            {...baseInputProps}
            id={docInputId}
            accept={`${ACCEPT_DOCUMENT},${ACCEPT_SPREADSHEET}`}
          />
          <input {...baseInputProps} id={bookInputId} accept={ACCEPT_EBOOK} />
          <input {...baseInputProps} id={allInputId} accept={accept} />
        </div>

        <PrivacyBanner compact />

        <p className="text-[11px] text-gray-400 text-center leading-relaxed px-2">
          Поддерживаются: {SUPPORTED_FORMATS_HINT}. На iPhone — «Файлы» или «Фото».
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {hint && (
        <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-center">
          {hint}
        </p>
      )}

      <div
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          processList(e.dataTransfer.files);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        className={`rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center transition-colors bg-white shadow-sm ${
          dragging
            ? "border-gray-900 bg-gray-50"
            : highlighted
              ? "border-gray-900 ring-2 ring-gray-900/10"
              : "border-gray-300 hover:border-gray-400"
        } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
      >
        <input {...baseInputProps} id={allInputId} accept={accept} />

        <div className="text-4xl mb-3 select-none" aria-hidden>
          📁
        </div>
        <p className="text-base font-semibold text-gray-900">Перетащите файл сюда</p>
        <p className="mt-1 text-sm text-gray-500">
          или выберите с компьютера · только поддерживаемые форматы
        </p>

        <label
          htmlFor={allInputId}
          className={`inline-block mt-5 px-6 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 hover:bg-gray-700 text-white transition-colors shadow-sm ${
            disabled ? "opacity-50 pointer-events-none" : "cursor-pointer"
          }`}
        >
          Выбрать файл
        </label>
      </div>

      <PrivacyBanner compact />
    </section>
  );
}
