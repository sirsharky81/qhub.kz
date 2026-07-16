"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";

const ScannerCameraCapture = dynamic(
  () => import("@/app/tools/document-scanner/components/ScannerCameraCapture"),
  { ssr: false },
);

interface Props {
  onImage: (file: File) => void;
  onClose: () => void;
}

export function SplitReceiptCapture({ onImage, onClose }: Props) {
  const [mode, setMode] = useState<"pick" | "camera">("pick");
  const galleryRef = useRef<HTMLInputElement>(null);

  if (mode === "camera") {
    return (
      <ScannerCameraCapture
        onCapture={(file) => onImage(file)}
        onClose={() => setMode("pick")}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-emerald-950/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 space-y-3 shadow-xl">
        <h3 className="text-sm font-semibold text-emerald-950">По чеку</h3>
        <p className="text-xs text-emerald-950/60 leading-relaxed">
          Сфотографируйте нижнюю часть чека, где указано ИТОГО.
        </p>
        <button
          type="button"
          className="w-full rounded-xl bg-teal-800 text-white py-3 text-sm font-medium"
          onClick={() => setMode("camera")}
        >
          Сделать фото
        </button>
        <button
          type="button"
          className="w-full rounded-xl border border-emerald-900/15 py-3 text-sm text-emerald-950/80"
          onClick={() => galleryRef.current?.click()}
        >
          Из галереи
        </button>
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onImage(file);
          }}
        />
        <button
          type="button"
          className="w-full text-xs text-emerald-950/45 py-1"
          onClick={onClose}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
