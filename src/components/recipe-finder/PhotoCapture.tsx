"use client";

import { useRef, useState, useCallback } from "react";

interface Props {
  onIngredientsFound: (ingredients: string[]) => void;
  onLoading: (loading: boolean) => void;
  isLoading: boolean;
}

export default function PhotoCapture({ onIngredientsFound, onLoading, isLoading }: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState(false);

  const analyzeImage = useCallback(async (dataUrl: string) => {
    setError(null);
    setAnalyzed(false);
    onLoading(true);
    try {
      const res = await fetch("/api/recipes/analyze-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка анализа фото");
        return;
      }
      if (!data.ingredients || data.ingredients.length === 0) {
        setError("Продукты на фото не обнаружены. Попробуйте другое фото.");
        return;
      }
      setAnalyzed(true);
      onIngredientsFound(data.ingredients);
    } catch {
      setError("Не удалось проанализировать фото. Проверьте соединение.");
    } finally {
      onLoading(false);
    }
  }, [onIngredientsFound, onLoading]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      setError("Выберите файл изображения (JPEG, PNG, WEBP)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPreview(dataUrl);
      analyzeImage(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function handleReset() {
    setPreview(null);
    setError(null);
    setAnalyzed(false);
  }

  return (
    <div className="space-y-3">
      {/* Two hidden inputs: camera and gallery */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {!preview ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center">
              <span className="text-3xl">📸</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Поиск рецептов по фото продуктов</p>
              <p className="text-xs text-gray-500 mt-1">Сфотографируйте продукты или загрузите готовое фото</p>
            </div>
            {/* Two separate buttons for camera and gallery */}
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 hover:bg-gray-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                📷 Камера
              </button>
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 hover:border-gray-400 text-gray-700 text-xs font-medium rounded-lg transition-colors"
              >
                🖼 Галерея
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative rounded-xl overflow-hidden border border-gray-200">
          <img
            src={preview}
            alt="Загруженное фото"
            className="w-full max-h-64 object-cover"
          />
          {isLoading && (
            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <p className="text-white text-sm font-medium">Анализирую продукты...</p>
            </div>
          )}
          {analyzed && !isLoading && (
            <div className="absolute top-3 right-3">
              <span className="px-2.5 py-1 bg-green-500 text-white text-xs font-medium rounded-full flex items-center gap-1">
                ✓ Продукты найдены
              </span>
            </div>
          )}
          {!isLoading && (
            <button
              onClick={handleReset}
              className="absolute top-3 left-3 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-sm transition-colors"
            >
              ×
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-red-500 text-sm mt-0.5">⚠</span>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        ИИ распознает продукты на фото и добавит их в поиск
      </p>
    </div>
  );
}
