"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { NormPoint } from "@/lib/document-scanner/types";
import {
  estimateOutputSize,
  rotateCanvas,
  warpPerspective,
} from "@/lib/document-scanner/canvas-utils";
import {
  AUTO_DETECT_MIN_CONFIDENCE,
  autoDetectDocumentCorners,
} from "@/lib/document-scanner/edge-detection";
import { defaultA4CropCorners } from "@/lib/document-scanner/crop-utils";
import { perfAsync } from "@/lib/document-scanner/scanner-perf";
import { yieldToMain } from "@/lib/document-scanner/async-utils";
import { btnOutline, btnPrimary, footerActions, footerBar, footerBtnBack, footerBtnNext, IconChevronLeft, IconChevronRight, IconRotate } from "./ScannerIcons";

interface Props {
  sourceCanvas: HTMLCanvasElement;
  initialCorners: NormPoint[];
  rotation: number;
  onRotationChange: (deg: number) => void;
  onConfirm: (croppedBlob: Blob) => void;
  onBack: () => void;
}

/** Corner order: TL, TR, BR, BL */
const EDGES: ReadonlyArray<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
];

type DragTarget =
  | { kind: "corner"; index: number }
  | { kind: "edge"; index: number };

function clampNorm(p: NormPoint): NormPoint {
  return {
    x: Math.min(1, Math.max(0, p.x)),
    y: Math.min(1, Math.max(0, p.y)),
  };
}

export default function CropScreen({
  sourceCanvas,
  initialCorners,
  rotation,
  onRotationChange,
  onConfirm,
  onBack,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [corners, setCorners] = useState<NormPoint[]>(initialCorners);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [processing, setProcessing] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoHint, setAutoHint] = useState<string | null>(null);
  const maskId = `crop-mask-${useId().replace(/[^a-zA-Z0-9-_]/g, "")}`;
  const dragRef = useRef<{
    target: DragTarget;
    startNorm: NormPoint;
    startCorners: NormPoint[];
  } | null>(null);
  const rotatedRef = useRef<HTMLCanvasElement | null>(null);

  const rotatedCanvas = rotatedRef.current ?? sourceCanvas;

  useEffect(() => {
    rotatedRef.current = rotateCanvas(sourceCanvas, rotation);
  }, [sourceCanvas, rotation]);

  useEffect(() => {
    setCorners(initialCorners);
  }, [initialCorners]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const maxW = el.clientWidth || window.innerWidth - 32;
      const maxH = Math.min(window.innerHeight * 0.55, 500);
      const aspect = rotatedCanvas.width / rotatedCanvas.height;
      let w = maxW;
      let h = w / aspect;
      if (h > maxH) {
        h = maxH;
        w = h * aspect;
      }
      setDisplaySize({ w, h });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rotatedCanvas]);

  useEffect(() => {
    const preview = previewCanvasRef.current;
    const src = rotatedRef.current ?? sourceCanvas;
    if (!preview || !src || displaySize.w <= 0) return;

    preview.width = Math.round(displaySize.w);
    preview.height = Math.round(displaySize.h);
    const ctx = preview.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    ctx.drawImage(src, 0, 0, preview.width, preview.height);
  }, [sourceCanvas, rotation, displaySize.w, displaySize.h]);

  const toDisplay = useCallback(
    (p: NormPoint) => ({
      x: p.x * displaySize.w,
      y: p.y * displaySize.h,
    }),
    [displaySize],
  );

  const fromDisplay = useCallback(
    (x: number, y: number): NormPoint => ({
      x: x / displaySize.w,
      y: y / displaySize.h,
    }),
    [displaySize],
  );

  function beginDrag(target: DragTarget, norm: NormPoint) {
    dragRef.current = {
      target,
      startNorm: norm,
      startCorners: corners.map((c) => ({ ...c })),
    };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const current = fromDisplay(x, y);
    const { target, startNorm, startCorners } = dragRef.current;
    const delta = {
      x: current.x - startNorm.x,
      y: current.y - startNorm.y,
    };

    if (target.kind === "corner") {
      setCorners((prev) =>
        prev.map((c, idx) => (idx === target.index ? clampNorm(current) : c)),
      );
      return;
    }

    const [a, b] = EDGES[target.index]!;
    setCorners(
      startCorners.map((c, idx) =>
        idx === a || idx === b ? clampNorm({ x: c.x + delta.x, y: c.y + delta.y }) : c,
      ),
    );
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  async function handleConfirm() {
    setProcessing(true);
    try {
      await perfAsync("crop-confirm", async () => {
        await yieldToMain();
        const canvas = rotatedRef.current ?? sourceCanvas;
        const { w, h } = estimateOutputSize(corners, canvas.width, canvas.height);
        const warped = await warpPerspective(canvas, corners, w, h);
        await yieldToMain();
        const blob = await new Promise<Blob>((resolve, reject) => {
          warped.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
            "image/jpeg",
            0.92,
          );
        });
        onConfirm(blob);
      });
    } finally {
      setProcessing(false);
    }
  }

  async function handleAutoDetect() {
    setAutoDetecting(true);
    setAutoHint(null);
    try {
      await yieldToMain();
      const canvas = rotatedRef.current ?? sourceCanvas;
      const result = await autoDetectDocumentCorners(canvas, (refined) => {
        setCorners(refined);
        setAutoHint(null);
      });
      setCorners(result?.corners ?? defaultA4CropCorners());
      if ((result?.confidence ?? 0) < AUTO_DETECT_MIN_CONFIDENCE) {
        setAutoHint("Документ не найден — подгоните рамку A4 вручную или нажмите «Рамка A4»");
      }
    } finally {
      setAutoDetecting(false);
    }
  }

  function applyA4Frame() {
    setCorners(defaultA4CropCorners());
    setAutoHint(null);
  }

  function edgeMidpoint(a: number, b: number): NormPoint {
    return {
      x: (corners[a]!.x + corners[b]!.x) / 2,
      y: (corners[a]!.y + corners[b]!.y) / 2,
    };
  }

  function edgeAngle(a: number, b: number): number {
    const d1 = toDisplay(corners[a]!);
    const d2 = toDisplay(corners[b]!);
    return (Math.atan2(d2.y - d1.y, d2.x - d1.x) * 180) / Math.PI;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      <div className="px-4 py-3 text-center border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Обрезка</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Рамка A4 — ориентир для ручной подгонки. Углы и грани — точная настройка.
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4 min-h-0 bg-gray-50">
        <div
          ref={containerRef}
          className="relative select-none touch-none rounded-xl overflow-hidden"
          style={{ width: displaySize.w || "100%", height: displaySize.h || 300 }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <canvas
            ref={previewCanvasRef}
            className="absolute inset-0 w-full h-full"
            aria-label="Исходное изображение"
          />

          <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
            <defs>
              <mask id={maskId}>
                <rect width="100%" height="100%" fill="white" />
                <polygon
                  points={corners.map((c) => {
                    const d = toDisplay(c);
                    return `${d.x},${d.y}`;
                  }).join(" ")}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.5)"
              mask={`url(#${maskId})`}
            />
            <polygon
              points={corners.map((c) => {
                const d = toDisplay(c);
                return `${d.x},${d.y}`;
              }).join(" ")}
              fill="rgba(255,255,255,0.04)"
              stroke="#111827"
              strokeWidth="2"
            />
          </svg>

          {EDGES.map(([a, b], edgeIndex) => {
            const mid = toDisplay(edgeMidpoint(a, b));
            const angle = edgeAngle(a, b);
            return (
              <div
                key={`edge-${edgeIndex}`}
                className="absolute z-[5] flex items-center justify-center cursor-grab active:cursor-grabbing"
                style={{
                  left: mid.x,
                  top: mid.y,
                  width: 28,
                  height: 14,
                  marginLeft: -14,
                  marginTop: -7,
                  transform: `rotate(${angle}deg)`,
                  touchAction: "none",
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const rect = containerRef.current!.getBoundingClientRect();
                  beginDrag(
                    { kind: "edge", index: edgeIndex },
                    fromDisplay(e.clientX - rect.left, e.clientY - rect.top),
                  );
                }}
                aria-label={`Грань ${edgeIndex + 1}`}
              >
                <span className="block w-5 h-1.5 rounded-full bg-white border border-gray-900 shadow" />
              </div>
            );
          })}

          {corners.map((c, i) => {
            const d = toDisplay(c);
            return (
              <div
                key={i}
                className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-gray-900 border-[1.5px] border-white shadow-md cursor-grab active:cursor-grabbing z-10"
                style={{ left: d.x, top: d.y, touchAction: "none" }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const rect = containerRef.current!.getBoundingClientRect();
                  beginDrag(
                    { kind: "corner", index: i },
                    fromDisplay(e.clientX - rect.left, e.clientY - rect.top),
                  );
                }}
                aria-label={`Угол ${i + 1}`}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 mt-4 justify-center">
          <button
            type="button"
            onClick={applyA4Frame}
            className={btnOutline("px-3 py-1.5 text-xs")}
          >
            Рамка A4
          </button>
          {[90, 180, 270].map((deg) => (
            <button
              key={deg}
              type="button"
              onClick={() => onRotationChange((rotation + deg) % 360)}
              className={btnOutline("px-3 py-1.5 text-xs")}
            >
              <IconRotate className="w-3.5 h-3.5" />
              {deg}°
            </button>
          ))}
          <button
            type="button"
            onClick={handleAutoDetect}
            disabled={autoDetecting}
            className={btnPrimary("px-3 py-1.5 text-xs")}
          >
            {autoDetecting ? "Поиск…" : "Авто"}
          </button>
        </div>
        {autoHint && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2 max-w-sm text-center">
            {autoHint}
          </p>
        )}
      </div>

      <div className={footerBar()}>
        <div className={footerActions()}>
          <button type="button" onClick={onBack} className={footerBtnBack()}>
            <IconChevronLeft className="w-3.5 h-3.5" />
            Назад
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={processing}
            className={footerBtnNext()}
          >
            {processing ? "Обработка…" : "Далее"}
            {!processing && <IconChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
