"use client";

import { useState, useEffect, useMemo } from "react";
import { PAPER_SIZES, PHOTO_SIZES, PhotoSize, PaperSize, PhotoCount, BackgroundColor, BACKGROUND_COLORS, calculateLayout } from "@/lib/passport-photo/dimensions";
import { composeLayout, downloadBlob } from "@/lib/passport-photo/canvas-utils";

interface Props {
  processedBlob: Blob;
  photoSize: PhotoSize;
  bgColor: BackgroundColor;
  onBack: () => void;
  onRestart: () => void;
}

const COUNT_OPTIONS: { value: PhotoCount; label: string }[] = [
  { value: 1, label: "1 фото" },
  { value: 4, label: "4 фото" },
  { value: 6, label: "6 фото" },
];

function buildPrintHtml(url: string, wCm: number, hCm: number) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Паспортное фото — QHub.kz</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; width: ${wCm}cm; height: ${hCm}cm; }
  img {
    display: block;
    width: ${wCm}cm;
    height: ${hCm}cm;
    object-fit: fill;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page {
    size: ${wCm}cm ${hCm}cm;
    margin: 0mm;
  }
</style>
</head>
<body>
<img src="${url}" alt="Паспортное фото" />
</body>
</html>`;
}

function printViaIframe(url: string, wCm: number, hCm: number): Promise<boolean> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute(
      "style",
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;"
    );
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win?.document;
    if (!doc || !win) {
      document.body.removeChild(iframe);
      resolve(false);
      return;
    }

    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
      }, 1500);
    };

    doc.open();
    doc.write(buildPrintHtml(url, wCm, hCm));
    doc.close();

    const img = doc.querySelector("img");
    const triggerPrint = () => {
      try {
        win.focus();
        win.print();
        resolve(true);
      } catch {
        resolve(false);
      } finally {
        cleanup();
      }
    };

    if (img?.complete) {
      setTimeout(triggerPrint, 150);
    } else if (img) {
      img.onload = () => setTimeout(triggerPrint, 150);
      img.onerror = () => {
        cleanup();
        resolve(false);
      };
    } else {
      cleanup();
      resolve(false);
    }
  });
}

export default function StepExport({ processedBlob, photoSize, bgColor, onBack, onRestart }: Props) {
  const [selectedPaperId, setSelectedPaperId] = useState(PAPER_SIZES[0].id);
  const [count, setCount] = useState<PhotoCount>(6);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);

  const selectedPaper = PAPER_SIZES.find((p) => p.id === selectedPaperId) ?? PAPER_SIZES[0];
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  const previewUrl = useMemo(() => URL.createObjectURL(processedBlob), [processedBlob]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  async function buildExportBlob(): Promise<{ blob: Blob; paper: PaperSize | null; filename: string }> {
    if (count === 1) {
      return {
        blob: processedBlob,
        paper: null,
        filename: `passport-photo-${photoSize.id}.jpg`,
      };
    }
    const blob = await composeLayout(
      processedBlob,
      photoSize,
      selectedPaper,
      count,
      BACKGROUND_COLORS[bgColor].value
    );
    return {
      blob,
      paper: selectedPaper,
      filename: `passport-photo-${photoSize.id}-${count}шт-${selectedPaper.id}.jpg`,
    };
  }

  async function handlePrint() {
    setPrinting(true);
    try {
      const { blob, paper } = await buildExportBlob();
      const printUrl = URL.createObjectURL(blob);
      const wCm = paper ? paper.widthCm : photoSize.widthCm;
      const hCm = paper ? paper.heightCm : photoSize.heightCm;

      const ok = await printViaIframe(printUrl, wCm, hCm);
      URL.revokeObjectURL(printUrl);

      if (!ok) {
        const mobile = window.matchMedia("(pointer: coarse)").matches;
        alert(
          mobile
            ? "Печать недоступна. Скачайте фото или нажмите «Поделиться», затем распечатайте из галереи."
            : "Не удалось открыть печать. Скачайте файл и распечатайте вручную."
        );
      }
    } finally {
      setPrinting(false);
    }
  }

  async function handleShare() {
    setSharing(true);
    try {
      const { blob, filename } = await buildExportBlob();
      const file = new File([blob], filename, { type: "image/jpeg" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Паспортное фото",
          text: "Фото на документы — QHub.kz",
        });
        return;
      }

      downloadBlob(blob, filename);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        alert("Не удалось поделиться. Попробуйте скачать фото.");
      }
    } finally {
      setSharing(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const { blob, filename } = await buildExportBlob();
      downloadBlob(blob, filename);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 py-6 px-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">Экспорт и печать</h2>
        <p className="text-sm text-gray-500 mt-1">Выберите количество фото и размер бумаги</p>
      </div>

      <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
        {previewUrl && (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Финальное фото"
              className="rounded-xl border border-gray-200 max-h-40 object-contain shadow-sm"
            />
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Количество на листе</p>
          <div className="flex gap-2">
            {COUNT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCount(opt.value)}
                className={[
                  "flex-1 py-2 rounded-xl border text-sm font-medium transition-colors",
                  count === opt.value
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 text-gray-600 hover:border-gray-400",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {count > 1 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Размер бумаги</p>
            <div className="grid grid-cols-2 gap-2">
              {PAPER_SIZES.map((paper) => {
                const layout = calculateLayout(photoSize, paper);
                const fits = layout.count >= count;
                return (
                  <button
                    key={paper.id}
                    onClick={() => { if (fits) setSelectedPaperId(paper.id); }}
                    disabled={!fits}
                    className={[
                      "flex flex-col items-start p-3 rounded-xl border text-left transition-colors",
                      selectedPaperId === paper.id
                        ? "border-gray-900 bg-gray-50"
                        : fits
                        ? "border-gray-200 hover:border-gray-300"
                        : "border-gray-100 opacity-40 cursor-not-allowed",
                    ].join(" ")}
                  >
                    <span className="text-sm font-medium text-gray-800">{paper.label}</span>
                    <span className="text-xs text-gray-400 mt-0.5">
                      {fits
                        ? `Вмещает ${layout.count} фото (${layout.columns}×${layout.rows})`
                        : `Не вмещает ${count} фото`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {count > 1 && (
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
            <strong>Раскладка:</strong> {count} фото {photoSize.label} на листе {selectedPaper.label} (300 DPI, готово к печати)
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-2">
          <button
            onClick={handleDownload}
            disabled={downloading || printing || sharing}
            className="flex-1 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {downloading ? (
              "Подготовка…"
            ) : (
              <>
                <span>⬇</span>
                {count === 1 ? "Скачать" : `Скачать (${count} шт.)`}
              </>
            )}
          </button>

          <button
            onClick={handleShare}
            disabled={sharing || downloading || printing}
            className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 md:hidden"
          >
            {sharing ? (
              "Подготовка…"
            ) : (
              <>
                <span>↗</span>
                {canShare ? "Поделиться" : "Сохранить / отправить"}
              </>
            )}
          </button>

          <button
            onClick={handlePrint}
            disabled={printing || downloading || sharing}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {printing ? (
              "Подготовка…"
            ) : (
              <>
                <span>🖨</span>
                Распечатать
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center md:hidden">
          Удобнее «Поделиться» — отправьте в галерею, WhatsApp или Telegram. Печать — через «Поделиться» → «Печать».
        </p>
        <p className="text-xs text-gray-400 text-center hidden md:block">
          JPEG, 300 DPI — откроется диалог печати браузера с нужным размером бумаги
        </p>
      </div>

      <div className="flex justify-between gap-3 max-w-lg mx-auto w-full">
        <button
          onClick={onBack}
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← Назад
        </button>
        <button
          onClick={onRestart}
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Новое фото
        </button>
      </div>
    </div>
  );
}
