"use client";

import { useCallback, useRef, useState } from "react";

interface UploadZoneProps {
  onFilesSelect: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

const FEATURES = [
  "Обрезка треков",
  "Сборка программы выступления",
  "Fade In / Fade Out",
  "Crossfade между треками",
  "Экспорт MP3 и WAV",
];

export function UploadZone({
  onFilesSelect,
  multiple = true,
  disabled = false,
  compact = false,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (fileList: FileList | File[] | null) => {
      if (!fileList || fileList.length === 0 || disabled) return;
      onFilesSelect(Array.from(fileList));
    },
    [disabled, onFilesSelect],
  );

  if (compact) {
    return (
      <div
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        className={`border-2 border-dashed rounded-xl p-2.5 text-center transition-colors ${
          isDragging ? "border-gray-900 bg-gray-50" : "border-gray-200"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-m4a,audio/mp4"
          multiple={multiple}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="text-xs text-gray-600 hover:text-gray-900 underline underline-offset-2 disabled:opacity-50"
        >
          Добавить ещё файлы
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-4 py-4 space-y-3">
        <div className="text-center">
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">🎵 Music Editor</h1>
          <p className="mt-1 text-xs text-gray-500">
            Подготовка музыки для фигурного катания, танцев и выступлений.
          </p>
        </div>

        <ul className="text-left space-y-1.5 bg-white border border-gray-200 rounded-2xl p-3 shadow-sm">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-xs text-gray-700">
              <span className="text-emerald-600 font-bold" aria-hidden>✓</span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <div
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          className={`border-2 border-dashed rounded-2xl p-6 transition-colors bg-white ${
            isDragging ? "border-gray-900 bg-gray-50" : "border-gray-300 hover:border-gray-400"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-m4a,audio/mp4"
            multiple={multiple}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <p className="text-xs text-gray-500 mb-0.5">MP3, WAV, M4A</p>
          <p className="text-[11px] text-gray-400 mb-3">
            <span className="hidden sm:inline">Перетащите файлы или выберите на устройстве</span>
            <span className="sm:hidden">Нажмите «Выбрать файлы» — MP3, WAV или M4A с устройства</span>
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 hover:bg-gray-700 text-white transition-colors disabled:opacity-50"
          >
            Выбрать файлы
          </button>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>Обработка в браузере — файлы не загружаются на сервер</span>
        </div>
      </div>
    </div>
  );
}
