"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FilterMode, PageAdjustments, PageOrientation } from "@/lib/document-scanner/types";
import { blobToCanvas } from "@/lib/document-scanner/canvas-utils";
import { applyFilters } from "@/lib/document-scanner/filters";
import {
  computeDrawSize,
  getAvailArea,
  getItemBounds,
  pointerToLocal,
  resolveWidthFrac,
  widthFracFromPointer,
} from "@/lib/document-scanner/layout-utils";
import { getPageAspectClass, getPreviewCanvasSize } from "@/lib/document-scanner/page-size";

interface Props {
  imageBlob: Blob;
  filter: FilterMode;
  adjustments: PageAdjustments;
  widthFrac: number;
  onWidthFracChange: (frac: number) => void;
  orientation?: PageOrientation;
  x?: number;
  y?: number;
  onPositionChange?: (x: number, y: number) => void;
  rotation?: number;
  className?: string;
}

export default function A4InteractivePreview({
  imageBlob,
  filter,
  adjustments,
  widthFrac,
  onWidthFracChange,
  orientation = "portrait",
  x = 0.5,
  y = 0.5,
  onPositionChange,
  rotation = 0,
  className = "",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filteredRef = useRef<HTMLCanvasElement | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);
  const moveRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );

  const { width: PAGE_W, height: PAGE_H } = useMemo(
    () => getPreviewCanvasSize(400, orientation),
    [orientation],
  );
  const aspectClass = getPageAspectClass(orientation);

  const { margin, availW, availH } = useMemo(
    () => getAvailArea(PAGE_W, PAGE_H),
    [PAGE_W, PAGE_H],
  );

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const filtered = filteredRef.current;
    if (!canvas || !filtered || !imgSize) return;

    canvas.width = PAGE_W;
    canvas.height = PAGE_H;

    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    const { drawW, drawH } = computeDrawSize(imgSize.w, imgSize.h, widthFrac, availW, availH);
    const cx = margin + x * availW;
    const cy = margin + y * availH;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(-drawW / 2 - 2, -drawH / 2 - 2, drawW + 4, drawH + 4);
    ctx.setLineDash([]);
    ctx.drawImage(filtered, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }, [imgSize, x, y, rotation, widthFrac, margin, availW, availH, PAGE_W, PAGE_H]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      const src = await blobToCanvas(imageBlob);
      if (cancelled) return;
      filteredRef.current = applyFilters(src, filter, adjustments);
      setImgSize({ w: src.width, h: src.height });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [imageBlob, filter, adjustments]);

  useEffect(() => {
    if (ready) redraw();
  }, [ready, redraw]);

  function canvasPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * PAGE_W,
      y: ((clientY - rect.top) / rect.height) * PAGE_H,
    };
  }

  function applyResize(clientX: number, clientY: number) {
    if (!imgSize) return;
    const pt = canvasPoint(clientX, clientY);
    if (!pt) return;
    const item = { x, y, widthFrac, rotation };
    const { cx, cy } = getItemBounds(item, imgSize.w, imgSize.h, PAGE_W, PAGE_H);
    const local = pointerToLocal(pt.x, pt.y, cx, cy, rotation);
    onWidthFracChange(
      widthFracFromPointer(
        cx,
        cy,
        cx + local.x,
        cy + local.y,
        imgSize.w,
        imgSize.h,
        availW,
        availH,
      ),
    );
  }

  const handlePositions =
    imgSize &&
    (() => {
      const item = { x, y, widthFrac, rotation };
      const { cx, cy, drawW, drawH } = getItemBounds(item, imgSize.w, imgSize.h, PAGE_W, PAGE_H);
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const locals = [
        { x: -drawW / 2, y: -drawH / 2 },
        { x: drawW / 2, y: -drawH / 2 },
        { x: drawW / 2, y: drawH / 2 },
        { x: -drawW / 2, y: drawH / 2 },
      ];
      return locals.map(({ x: lx, y: ly }) => ({
        x: cx + lx * cos - ly * sin,
        y: cy + lx * sin + ly * cos,
      }));
    })();

  return (
    <div className={`relative w-full max-w-xs ${className}`}>
      <canvas
        ref={canvasRef}
        width={PAGE_W}
        height={PAGE_H}
        className={`w-full ${aspectClass} border border-gray-200 rounded-xl shadow-sm bg-white touch-none`}
        onPointerDown={(e) => {
          if (!onPositionChange || !imgSize) return;
          const pt = canvasPoint(e.clientX, e.clientY);
          if (!pt) return;

          const item = { x, y, widthFrac, rotation };
          const { cx, cy, drawW, drawH } = getItemBounds(item, imgSize.w, imgSize.h, PAGE_W, PAGE_H);
          const local = pointerToLocal(pt.x, pt.y, cx, cy, rotation);
          if (Math.abs(local.x) > drawW / 2 || Math.abs(local.y) > drawH / 2) return;

          moveRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origX: x,
            origY: y,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const drag = moveRef.current;
          if (!drag || !canvasRef.current) return;
          const rect = canvasRef.current.getBoundingClientRect();
          const dx = (e.clientX - drag.startX) / rect.width;
          const dy = (e.clientY - drag.startY) / rect.height;
          onPositionChange?.(
            Math.min(1, Math.max(0, drag.origX + dx)),
            Math.min(1, Math.max(0, drag.origY + dy)),
          );
        }}
        onPointerUp={() => {
          moveRef.current = null;
        }}
      />

      {handlePositions?.map((hp, i) => (
        <div
          key={i}
          className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-gray-900 border-[1.5px] border-white shadow-md cursor-nwse-resize z-10 touch-none"
          style={{
            left: `${(hp.x / PAGE_W) * 100}%`,
            top: `${(hp.y / PAGE_H) * 100}%`,
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            applyResize(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          aria-label={`Изменить размер, угол ${i + 1}`}
        />
      ))}

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/80 text-gray-400 text-sm">
          Загрузка…
        </div>
      )}
    </div>
  );
}
