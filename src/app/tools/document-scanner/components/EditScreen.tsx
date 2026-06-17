"use client";

import { useEffect, useMemo, useState } from "react";
import type { A4FitMode, FilterMode, PageAdjustments, PageOrientation, ScanPage } from "@/lib/document-scanner/types";
import { DEFAULT_ADJUSTMENTS } from "@/lib/document-scanner/types";
import { FILTER_LABELS } from "@/lib/document-scanner/filters";
import { generateId } from "@/lib/document-scanner/constants";
import { blobToCanvas, detectContentRect } from "@/lib/document-scanner/canvas-utils";
import { applyFilters } from "@/lib/document-scanner/filters";
import {
  computeFitWidthFrac,
  FULL_PAGE_WIDTH_FRAC,
  getAvailArea,
} from "@/lib/document-scanner/layout-utils";
import { getPageAspectClass, getPageSizePx } from "@/lib/document-scanner/page-size";
import A4InteractivePreview from "./A4InteractivePreview";
import { btnOutline, footerActions, footerBar, footerBtnBack, footerBtnNext, IconChevronLeft, IconChevronRight, IconTextRecognize } from "./ScannerIcons";

interface Props {
  croppedBlob: Blob;
  existingPage?: ScanPage;
  onConfirm: (page: ScanPage) => void;
  onOcrExport: (blob: Blob, filter: FilterMode, adjustments: PageAdjustments) => void;
  onBack: () => void;
}

const FILTERS: FilterMode[] = ["color", "enhanced", "grayscale", "bw"];

export default function EditScreen({ croppedBlob, existingPage, onConfirm, onOcrExport, onBack }: Props) {
  const [filter, setFilter] = useState<FilterMode>(existingPage?.filter ?? "enhanced");
  const [adjustments, setAdjustments] = useState<PageAdjustments>(
    existingPage?.adjustments ?? DEFAULT_ADJUSTMENTS,
  );
  const [a4FitMode, setA4FitMode] = useState<A4FitMode>(existingPage?.a4FitMode ?? "fit");
  const [orientation, setOrientation] = useState<PageOrientation>(
    existingPage?.orientation ?? "portrait",
  );
  const [widthFrac, setWidthFrac] = useState<number | null>(
    existingPage?.items[0]?.widthFrac ?? null,
  );
  const [posX, setPosX] = useState(existingPage?.items[0]?.x ?? 0.5);
  const [posY, setPosY] = useState(existingPage?.items[0]?.y ?? 0.5);
  const [manualSize, setManualSize] = useState(!!existingPage?.items[0]?.widthFrac);

  function fillPage() {
    setManualSize(true);
    setWidthFrac(FULL_PAGE_WIDTH_FRAC);
    setPosX(0.5);
    setPosY(0.5);
  }

  useEffect(() => {
    if (manualSize) return;
    let cancelled = false;
    (async () => {
      const canvas = await blobToCanvas(croppedBlob);
      const filtered = applyFilters(canvas, filter, adjustments);
      const content = detectContentRect(filtered);
      const contentAspect = content.sw / content.sh;

      let pageOrientation = orientation;
      if (!existingPage) {
        if (contentAspect > 1.08) {
          pageOrientation = "landscape";
        } else if (contentAspect < 0.92) {
          pageOrientation = "portrait";
        }
        if (pageOrientation !== orientation) {
          setOrientation(pageOrientation);
        }
      }

      const { width, height } = getPageSizePx(pageOrientation);
      const { availW, availH } = getAvailArea(width, height);
      const frac = computeFitWidthFrac(content.sw, content.sh, availW, availH, a4FitMode);
      if (!cancelled) setWidthFrac(frac);
    })();
    return () => {
      cancelled = true;
    };
  }, [croppedBlob, a4FitMode, manualSize, orientation, existingPage, filter, adjustments]);

  const draftPage = useMemo<ScanPage | null>(() => {
    if (widthFrac == null && !existingPage?.items[0]) return null;
    const baseItem = existingPage?.items[0];
    return {
      id: existingPage?.id ?? generateId(),
      name: existingPage?.name ?? "Страница",
      filter,
      adjustments,
      a4FitMode,
      orientation,
      items: existingPage?.items?.length
        ? existingPage.items.map((it, i) =>
            i === 0
              ? {
                  ...it,
                  imageBlob: croppedBlob,
                  widthFrac: widthFrac ?? it.widthFrac,
                  x: posX,
                  y: posY,
                }
              : it,
          )
        : [
            {
              id: generateId(),
              imageBlob: croppedBlob,
              x: posX,
              y: posY,
              widthFrac: widthFrac ?? 1,
              rotation: 0,
            },
          ],
    };
  }, [existingPage, filter, adjustments, a4FitMode, orientation, croppedBlob, widthFrac, posX, posY]);

  function adjust(key: keyof PageAdjustments, delta: number) {
    setAdjustments((prev) => ({
      ...prev,
      [key]: Math.min(100, Math.max(-100, prev[key] + delta)),
    }));
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      <div className="px-4 py-3 text-center border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Редактирование</h2>
        <p className="text-xs text-gray-500 mt-0.5">Фильтры и размещение на листе A4</p>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 py-4 min-h-0 overflow-y-auto">
        {widthFrac != null ? (
          <A4InteractivePreview
            imageBlob={croppedBlob}
            filter={filter}
            adjustments={adjustments}
            widthFrac={widthFrac}
            orientation={orientation}
            onWidthFracChange={(frac) => {
              setManualSize(true);
              setWidthFrac(frac);
            }}
            x={posX}
            y={posY}
            onPositionChange={(nx, ny) => {
              setPosX(nx);
              setPosY(ny);
            }}
            className="mb-2"
          />
        ) : (
          <div className={`w-full max-w-xs ${getPageAspectClass(orientation)} bg-white rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 text-sm mb-2`}>
            Загрузка…
          </div>
        )}
        <p className="text-[11px] text-gray-500 text-center mb-2 max-w-xs">
          Потяните углы для изменения размера (пропорции сохраняются). Перетащите изображение для
          смещения на листе.
        </p>
        <button
          type="button"
          onClick={fillPage}
          className={btnOutline("mb-4 px-4 py-2 text-xs")}
        >
          На весь лист
        </button>

        <div className="w-full max-w-md space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Режим</p>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    filter === f
                      ? "bg-gray-900 text-white border-transparent"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {FILTER_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Ориентация
            </p>
            <div className="flex gap-2">
              {(
                [
                  ["portrait", "Книжная"],
                  ["landscape", "Альбомная"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setOrientation(mode)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                    orientation === mode
                      ? "bg-gray-900 text-white border-transparent"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Размещение на A4
            </p>
            <div className="flex gap-2">
              {(
                [
                  ["fit", "По размеру листа"],
                  ["natural", "Размер фото (1:1)"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setManualSize(false);
                    setA4FitMode(mode);
                    if (mode === "fit") {
                      setWidthFrac(FULL_PAGE_WIDTH_FRAC);
                      setPosX(0.5);
                      setPosY(0.5);
                    }
                  }}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                    a4FitMode === mode
                      ? "bg-gray-900 text-white border-transparent"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["brightness", "Яркость", "+", "-"],
                ["contrast", "Контраст", "+", "-"],
              ] as const
            ).map(([key, label, plus, minus]) => (
              <div key={key} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-600 mb-2">{label}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => adjust(key, -10)}
                    className="flex-1 py-1.5 rounded-lg bg-white border border-gray-200 text-sm font-medium hover:bg-gray-50"
                  >
                    {minus}
                  </button>
                  <span className="flex items-center text-xs font-mono w-8 justify-center text-gray-500">
                    {adjustments[key]}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjust(key, 10)}
                    className="flex-1 py-1.5 rounded-lg bg-white border border-gray-200 text-sm font-medium hover:bg-gray-50"
                  >
                    {plus}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAdjustments(DEFAULT_ADJUSTMENTS)}
            className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
          >
            Вернуть к оригиналу
          </button>

          <button
            type="button"
            onClick={() => onOcrExport(croppedBlob, filter, adjustments)}
            className={btnOutline("w-full py-2.5 text-xs")}
          >
            <IconTextRecognize className="w-4 h-4" />
            Извлечь текст в Word
          </button>
        </div>
      </div>

      <div className={footerBar()}>
        <div className={footerActions()}>
          <button type="button" onClick={onBack} className={footerBtnBack()}>
            <IconChevronLeft className="w-3.5 h-3.5" />
            Назад
          </button>
          <button
            type="button"
            disabled={!draftPage}
            onClick={() => draftPage && onConfirm(draftPage)}
            className={footerBtnNext()}
          >
            Готово
            <IconChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
