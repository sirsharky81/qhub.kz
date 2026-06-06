"use client";

import { useRef, useState, useCallback } from "react";
import ReactCrop, { makeAspectCrop, centerCrop, convertToPixelCrop, Crop, PixelCrop, PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { PHOTO_SIZES, PhotoSize } from "@/lib/passport-photo/dimensions";

interface Props {
  imageUrl: string;
  onCropComplete: (
    crop: PixelCrop,
    imageEl: HTMLImageElement,
    selectedSize: PhotoSize
  ) => void;
  onBack: () => void;
}

export default function StepCrop({ imageUrl, onCropComplete, onBack }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [selectedSizeId, setSelectedSizeId] = useState(PHOTO_SIZES[0].id);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined);

  const selectedSize = PHOTO_SIZES.find((s) => s.id === selectedSizeId) ?? PHOTO_SIZES[0];
  const aspect = selectedSize.widthCm / selectedSize.heightCm;

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;
      const initial = centerCrop(
        makeAspectCrop({ unit: "%", width: 80 }, aspect, width, height),
        width,
        height
      );
      setCrop(initial);
      setCompletedCrop(convertToPixelCrop(initial, width, height));
    },
    [aspect]
  );

  function handleSizeChange(sizeId: string) {
    setSelectedSizeId(sizeId);
    if (!imgRef.current) return;
    const { width, height } = imgRef.current;
    const newSize = PHOTO_SIZES.find((s) => s.id === sizeId) ?? PHOTO_SIZES[0];
    const newAspect = newSize.widthCm / newSize.heightCm;
    const initial = centerCrop(
      makeAspectCrop({ unit: "%", width: 80 }, newAspect, width, height),
      width,
      height
    );
    setCrop(initial);
    setCompletedCrop(convertToPixelCrop(initial, width, height));
  }

  function handleNext() {
    if (!completedCrop || !imgRef.current) return;
    onCropComplete(completedCrop, imgRef.current, selectedSize);
  }

  return (
    <div className="flex flex-col gap-6 py-6 px-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">Кадрирование</h2>
        <p className="text-sm text-gray-500 mt-1">Выберите формат и откорректируйте обрезку</p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {PHOTO_SIZES.map((size) => (
          <button
            key={size.id}
            onClick={() => handleSizeChange(size.id)}
            className={[
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              selectedSizeId === size.id
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400",
            ].join(" ")}
          >
            {size.label}
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <div className="max-w-lg w-full">
          <ReactCrop
            crop={crop}
            onChange={(px: PixelCrop, _pct: PercentCrop) => setCrop(px as Crop)}
            onComplete={(px: PixelCrop) => setCompletedCrop(px)}
            aspect={aspect}
            keepSelection
            className="rounded-xl overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Исходное фото"
              onLoad={onImageLoad}
              className="max-h-[60vh] w-auto object-contain"
              style={{ maxWidth: "100%" }}
            />
          </ReactCrop>
        </div>
      </div>

      <div className="flex justify-between gap-3 max-w-lg mx-auto w-full">
        <button
          onClick={onBack}
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← Назад
        </button>
        <button
          onClick={handleNext}
          disabled={!completedCrop || completedCrop.width < 10}
          className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Далее →
        </button>
      </div>
    </div>
  );
}
