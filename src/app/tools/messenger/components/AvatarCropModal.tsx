"use client";

import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PercentCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import type { AvatarCropRect } from "@/lib/messenger/avatar-compress";

interface Props {
  open: boolean;
  file: File | null;
  onCancel: () => void;
  onConfirm: (crop: AvatarCropRect) => void;
  busy?: boolean;
}

function initialSquareCrop(width: number, height: number): PercentCrop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, 1, width, height),
    width,
    height,
  );
}

export function AvatarCropModal({ open, file, onCancel, onConfirm, busy }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completed, setCompleted] = useState<PercentCrop | null>(null);

  useEffect(() => {
    if (!open || !file) {
      setSrc(null);
      setCrop(undefined);
      setCompleted(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [open, file]);

  const onImageLoad = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    const next = initialSquareCrop(naturalWidth, naturalHeight);
    setCrop(next);
    setCompleted(next);
  }, []);

  if (!open || !src) return null;

  const content = (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white shadow-xl overflow-hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="px-4 pt-4 pb-2">
          <h2 className="text-base font-semibold text-gray-900">Позиция фото</h2>
          <p className="text-xs text-gray-500 mt-1">
            Перетащите и измените размер круга, чтобы выбрать область аватара.
          </p>
        </div>
        <div className="bg-gray-950 px-2 py-3 flex justify-center max-h-[55vh] overflow-auto">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(_, percent) => setCompleted(percent)}
            aspect={1}
            circularCrop
            keepSelection
            minWidth={20}
            className="max-w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="Кадрирование"
              onLoad={onImageLoad}
              className="max-h-[50vh] w-auto max-w-full"
            />
          </ReactCrop>
        </div>
        <div className="flex gap-2 p-4">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-gray-200 py-3 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy || !completed}
            onClick={() => {
              if (!completed) return;
              onConfirm({
                x: completed.x,
                y: completed.y,
                width: completed.width,
                height: completed.height,
              });
            }}
            className="flex-1 rounded-2xl bg-gray-900 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
