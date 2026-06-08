"use client";

import { useState, useEffect, useRef } from "react";
import PhotoTips from "@/components/passport-photo/PhotoTips";
import { BACKGROUND_COLORS, BackgroundColor, PhotoSize } from "@/lib/passport-photo/dimensions";
import { applyBackground } from "@/lib/passport-photo/canvas-utils";

interface Props {
  croppedBlob: Blob;
  photoSize: PhotoSize;
  onComplete: (resultBlob: Blob, bgColor: BackgroundColor) => void;
  onBack: () => void;
}

type Mode = "ai" | "original";
type Status = "idle" | "loading" | "done" | "error";

export default function StepBackground({ croppedBlob, photoSize, onComplete, onBack }: Props) {
  const [bgColor, setBgColor] = useState<BackgroundColor>("white");
  const [mode, setMode] = useState<Mode>("ai");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const prevParams = useRef<string>("");

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function processBackground() {
    const key = `${mode}-${bgColor}`;
    if (key === prevParams.current && resultBlob) return;
    prevParams.current = key;

    setStatus("loading");
    setErrorMsg(null);

    try {
      let outputBlob: Blob;

      if (mode === "ai") {
        const { removeBackground } = await import("@imgly/background-removal");
        const removedBlob = await removeBackground(croppedBlob, {
          output: { format: "image/png" },
        });
        outputBlob = await applyBackground(removedBlob, BACKGROUND_COLORS[bgColor].value, photoSize);
      } else {
        outputBlob = croppedBlob;
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(outputBlob);
      setPreviewUrl(url);
      setResultBlob(outputBlob);
      setStatus("done");
    } catch (e) {
      console.error(e);
      setStatus("error");
      setErrorMsg(
        mode === "ai"
          ? "Не удалось удалить фон. Попробуйте режим «Не менять фон» или другой браузер."
          : "Ошибка обработки. Попробуйте ещё раз."
      );
    }
  }

  function handleNext() {
    if (resultBlob) onComplete(resultBlob, bgColor);
  }

  return (
    <div className="flex flex-col gap-6 py-6 px-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">Обработка фона</h2>
        <p className="text-sm text-gray-500 mt-1">Выберите способ замены фона и цвет</p>
      </div>

      <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Способ</p>
          <div className="grid grid-cols-2 gap-2">
            {(["ai", "original"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); prevParams.current = ""; setStatus("idle"); setResultBlob(null); }}
                className={[
                  "flex flex-col items-start gap-1 p-3 rounded-xl border transition-colors text-left",
                  mode === m ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300",
                ].join(" ")}
              >
                <span className="text-sm font-medium text-gray-800">
                  {m === "ai" ? "🤖 ИИ удаление фона" : "📷 Не менять фон"}
                </span>
                <span className="text-xs text-gray-400">
                  {m === "ai"
                    ? "Вырезает силуэт и ставит белый/голубой фон (~40 МБ)"
                    : "Фото остаётся без изменений"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {mode === "ai" && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <PhotoTips compact />
          </div>
        )}

        {mode === "ai" && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Цвет фона</p>
            <div className="flex gap-3">
              {(Object.entries(BACKGROUND_COLORS) as [BackgroundColor, typeof BACKGROUND_COLORS[BackgroundColor]][]).map(
                ([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => { setBgColor(key); prevParams.current = ""; setStatus("idle"); setResultBlob(null); }}
                    className={[
                      "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors",
                      bgColor === key ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300",
                    ].join(" ")}
                  >
                    <span
                      className="w-5 h-5 rounded-full border border-gray-200 flex-shrink-0"
                      style={{ background: cfg.value }}
                    />
                    {cfg.label}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        <button
          onClick={processBackground}
          disabled={status === "loading"}
          className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
          {status === "loading"
            ? "Обработка…"
            : mode === "ai"
            ? "Применить фон"
            : "Использовать фото как есть"}
        </button>

        {errorMsg && (
          <p className="text-sm text-red-500 text-center">{errorMsg}</p>
        )}

        {status === "loading" && mode === "ai" && (
          <p className="text-xs text-gray-400 text-center">
            При первом запуске загружается AI-модель (~40 МБ). Это может занять 1–2 минуты.
          </p>
        )}

        {previewUrl && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Результат</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Результат обработки фона"
              className="rounded-xl border border-gray-200 max-h-48 object-contain shadow-sm"
            />
          </div>
        )}
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
          disabled={!resultBlob}
          className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Далее →
        </button>
      </div>
    </div>
  );
}
