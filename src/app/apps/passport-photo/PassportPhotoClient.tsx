"use client";

import { useState, useCallback } from "react";
import { PhotoSize, BackgroundColor } from "@/lib/passport-photo/dimensions";
import StepUpload from "@/components/passport-photo/StepUpload";
import StepCrop from "@/components/passport-photo/StepCrop";
import StepBackground from "@/components/passport-photo/StepBackground";
import StepExport from "@/components/passport-photo/StepExport";

type Step = 0 | 1 | 2 | 3;

const STEP_LABELS = ["Загрузка", "Кадрирование", "Фон", "Экспорт"];

interface State {
  imageUrl: string | null;
  imageFile: File | null;
  croppedBlob: Blob | null;
  processedBlob: Blob | null;
  bgColor: BackgroundColor;
  selectedPhotoSize: PhotoSize | null;
}

export default function PassportPhotoClient() {
  const [step, setStep] = useState<Step>(0);
  const [state, setState] = useState<State>({
    imageUrl: null,
    imageFile: null,
    croppedBlob: null,
    processedBlob: null,
    bgColor: "white",
    selectedPhotoSize: null,
  });

  const handleImageSelected = useCallback((file: File, url: string) => {
    setState((s) => ({ ...s, imageFile: file, imageUrl: url }));
    setStep(1);
  }, []);

  const handleCropComplete = useCallback((croppedBlob: Blob, photoSize: PhotoSize) => {
    setState((s) => ({
      ...s,
      croppedBlob,
      selectedPhotoSize: photoSize,
    }));
    setStep(2);
  }, []);

  const handleBackgroundComplete = useCallback((blob: Blob, bgColor: BackgroundColor) => {
    setState((s) => ({ ...s, processedBlob: blob, bgColor }));
    setStep(3);
  }, []);

  function handleRestart() {
    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
    setState({
      imageUrl: null,
      imageFile: null,
      croppedBlob: null,
      processedBlob: null,
      bgColor: "white",
      selectedPhotoSize: null,
    });
    setStep(0);
  }

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center max-w-2xl mx-auto px-4 py-3 gap-2">
          {STEP_LABELS.map((label, i) => {
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={label} className="flex items-center gap-2 flex-1 last:flex-none">
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div
                    className={[
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                      isActive
                        ? "bg-gray-900 text-white"
                        : isDone
                        ? "bg-green-500 text-white"
                        : "bg-gray-100 text-gray-400",
                    ].join(" ")}
                  >
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span
                    className={[
                      "text-xs font-medium hidden sm:inline",
                      isActive ? "text-gray-900" : isDone ? "text-green-600" : "text-gray-400",
                    ].join(" ")}
                  >
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div
                    className={[
                      "flex-1 h-px transition-colors",
                      isDone ? "bg-green-300" : "bg-gray-100",
                    ].join(" ")}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full">
        {step === 0 && (
          <StepUpload onImageSelected={handleImageSelected} />
        )}
        {step === 1 && state.imageFile && (
          <StepCrop
            key={state.imageUrl ?? state.imageFile.name}
            imageFile={state.imageFile}
            onCropComplete={handleCropComplete}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && state.croppedBlob && state.selectedPhotoSize && (
          <StepBackground
            croppedBlob={state.croppedBlob}
            photoSize={state.selectedPhotoSize}
            onComplete={handleBackgroundComplete}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && state.processedBlob && state.selectedPhotoSize && (
          <StepExport
            processedBlob={state.processedBlob}
            photoSize={state.selectedPhotoSize}
            bgColor={state.bgColor}
            onBack={() => setStep(2)}
            onRestart={handleRestart}
          />
        )}
      </div>
    </div>
  );
}
