"use client";

import { useRef, useState } from "react";
import CameraCapture from "@/components/passport-photo/CameraCapture";
import PhotoTips from "@/components/passport-photo/PhotoTips";

interface Props {
  onImageSelected: (file: File, objectUrl: string) => void;
}

export default function StepUpload({ onImageSelected }: Props) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  function isImageFile(file: File): boolean {
    if (file.type.startsWith("image/")) return true;
    return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  }

  function handleFile(file: File) {
    setError(null);
    if (!isImageFile(file)) {
      setError("Пожалуйста, загрузите файл изображения (JPEG, PNG, HEIC, WebP).");
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
    // Reset so the same file can be picked again if needed
    e.target.value = "";
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

      {/* Mobile: camera / gallery */}
      <div className="flex flex-col gap-3 w-full max-w-md md:hidden">
          <button
            type="button"
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.mediaDevices) {
                setShowCamera(true);
              } else {
                cameraInputRef.current?.click();
              }
            }}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gray-900 text-white font-medium text-sm transition-colors hover:bg-gray-700 active:scale-[0.98]"
          >
            <CameraIcon />
            Сделать фото
          </button>

          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl border-2 border-gray-200 bg-gray-50 text-gray-700 font-medium text-sm transition-colors hover:border-gray-300 hover:bg-gray-100 active:scale-[0.98]"
          >
            <GalleryIcon />
            Выбрать из галереи
          </button>
        </div>

      {/* Desktop: drag-and-drop */}
      <button
        type="button"
        onClick={() => galleryInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={[
          "hidden md:flex w-full max-w-md border-2 border-dashed rounded-2xl p-12 transition-colors cursor-pointer",
          "flex-col items-center gap-4 text-center",
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

      {/* Fallback camera input (без capture=user — Samsung иначе отдаёт обрезанный JPEG) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />

      {showCamera && (
        <CameraCapture
          onCapture={(file) => {
            setShowCamera(false);
            handleFile(file);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
      {/* Gallery / file-picker input — no capture attribute */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        className="hidden"
        onChange={handleInputChange}
      />

      <div className="w-full max-w-md">
        <PhotoTips />
      </div>

      {error && (
        <p className="text-sm text-red-500 text-center">{error}</p>
      )}

      <div className="flex flex-wrap justify-center gap-3 text-xs text-gray-400">
        <span className="flex items-center gap-1">✓ Бесплатно</span>
        <span className="flex items-center gap-1">✓ Без регистрации</span>
        <span className="flex items-center gap-1">✓ Файл не покидает ваш браузер</span>
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}
