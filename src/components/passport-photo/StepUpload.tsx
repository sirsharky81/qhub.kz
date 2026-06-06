"use client";

import { useRef, useState } from "react";

interface Props {
  onImageSelected: (file: File, objectUrl: string) => void;
}

export default function StepUpload({ onImageSelected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Пожалуйста, загрузите файл изображения (JPEG, PNG, WebP).");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Файл слишком большой. Максимум 20 МБ.");
      return;
    }
    const url = URL.createObjectURL(file);
    onImageSelected(file, url);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="flex flex-col items-center gap-8 py-8 px-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">Загрузите фотографию</h2>
        <p className="mt-1 text-sm text-gray-500">
          Подойдёт портретное фото с чётким лицом. JPEG, PNG, WebP — до 20 МБ.
        </p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={[
          "w-full max-w-md border-2 border-dashed rounded-2xl p-12 transition-colors cursor-pointer",
          "flex flex-col items-center gap-4 text-center",
          dragging
            ? "border-blue-400 bg-blue-50"
            : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100",
        ].join(" ")}
      >
        <span className="text-5xl select-none">📷</span>
        <div>
          <p className="text-sm font-medium text-gray-700">Перетащите фото сюда</p>
          <p className="text-xs text-gray-400 mt-0.5">или нажмите для выбора файла</p>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleInputChange}
      />

      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      <div className="flex flex-wrap justify-center gap-3 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span>✓</span> Бесплатно
        </span>
        <span className="flex items-center gap-1">
          <span>✓</span> Без регистрации
        </span>
        <span className="flex items-center gap-1">
          <span>✓</span> Файл не покидает ваш браузер
        </span>
      </div>
    </div>
  );
}
