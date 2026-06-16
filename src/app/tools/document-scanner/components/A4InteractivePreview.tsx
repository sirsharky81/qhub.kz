"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FilterMode, PageAdjustments, PageOrientation } from "@/lib/document-scanner/types";
import { blobToCanvas, detectContentRect, type ContentRect } from "@/lib/document-scanner/canvas-utils";
import { applyFilters } from "@/lib/document-scanner/filters";
import {
  computeDrawSize,
  getAvailArea,
  getItemBounds,
  pointerToLocal,
  widthFracFromDragRatio,
} from "@/lib/document-scanner/layout-utils";
import { getPageAspectClass, getPreviewCanvasSize } from "@/lib/document-scanner/page-size";
import {
  startPointerDrag,
  TOUCH_HANDLE_PX,
  touchHandleOuterClass,
  touchResizeDotClass,
} from "@/lib/document-scanner/pointer-drag";

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
  const contentRef = useRef<ContentRect | null>(null);
  const [layoutSize, setLayoutSize] = useState<{ w: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);

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
    const layout = layoutSize;
    const content = contentRef.current;
    if (!canvas || !filtered || !layout || !content) return;

    canvas.width = PAGE_W;
    canvas.height = PAGE_H;

    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    const { drawW, drawH } = computeDrawSize(layout.w, layout.h, widthFrac, availW, availH);
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
    ctx.drawImage(
      filtered,
      content.sx,
      content.sy,
      content.sw,
      content.sh,
      -drawW / 2,
      -drawH / 2,
      drawW,
      drawH,
    );
    ctx.restore();
  }, [x, y, rotation, widthFrac, margin, availW, availH, PAGE_W, PAGE_H, layoutSize]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      const src = await blobToCanvas(imageBlob);
      if (cancelled) return;
      const filtered = applyFilters(src, filter, adjustments);
      filteredRef.current = filtered;
      const content = detectContentRect(filtered);
      contentRef.current = content;
      setLayoutSize({ w: content.sw, h: content.sh });
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

  function beginResize(e: React.PointerEvent) {
    if (!layoutSize) return;

    const pt = canvasPoint(e.clientX, e.clientY);
    if (!pt) return;

    const item = { x, y, widthFrac, rotation };
    const { cx, cy, drawW, drawH } = getItemBounds(
      item,
      layoutSize.w,
      layoutSize.h,
      PAGE_W,
      PAGE_H,
    );
    const startLocal = pointerToLocal(pt.x, pt.y, cx, cy, rotation);
    const startWidthFrac = widthFrac;

    startPointerDrag(e, (ev) => {
      const movePt = canvasPoint(ev.clientX, ev.clientY);
      if (!movePt) return;
      const local = pointerToLocal(movePt.x, movePt.y, cx, cy, rotation);
      onWidthFracChange(
        widthFracFromDragRatio(
          local.x,
          local.y,
          startLocal.x,
          startLocal.y,
          startWidthFrac,
          layoutSize.w,
          layoutSize.h,
          availW,
          availH,
        ),
      );
    });
  }

  const handlePositions =
    layoutSize && ready
      ? (() => {
          const item = { x, y, widthFrac, rotation };
          const { cx, cy, drawW, drawH } = getItemBounds(
            item,
            layoutSize.w,
            layoutSize.h,
            PAGE_W,
            PAGE_H,
          );
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
        })()
      : null;

  return (
    <div className={`relative w-full max-w-xs ${className}`}>
      <canvas
        ref={canvasRef}
        width={PAGE_W}
        height={PAGE_H}
        className={`w-full ${aspectClass} border border-gray-200 rounded-xl shadow-sm bg-white touch-none`}
        onPointerDown={(e) => {
          if (!onPositionChange || !layoutSize) return;
          const pt = canvasPoint(e.clientX, e.clientY);
          if (!pt) return;

          const item = { x, y, widthFrac, rotation };
          const { cx, cy, drawW, drawH } = getItemBounds(
            item,
            layoutSize.w,
            layoutSize.h,
            PAGE_W,
            PAGE_H,
          );
          const local = pointerToLocal(pt.x, pt.y, cx, cy, rotation);
          if (Math.abs(local.x) > drawW / 2 || Math.abs(local.y) > drawH / 2) return;

          const origX = x;
          const origY = y;
          const startX = e.clientX;
          const startY = e.clientY;

          startPointerDrag(e, (ev) => {
            if (!canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const dx = (ev.clientX - startX) / rect.width;
            const dy = (ev.clientY - startY) / rect.height;
            onPositionChange?.(
              Math.min(1, Math.max(0, origX + dx)),
              Math.min(1, Math.max(0, origY + dy)),
            );
          });
        }}
      />

      {handlePositions?.map((hp, i) => (
        <div
          key={i}
          className={touchHandleOuterClass}
          style={{
            left: `${(hp.x / PAGE_W) * 100}%`,
            top: `${(hp.y / PAGE_H) * 100}%`,
            width: TOUCH_HANDLE_PX,
            height: TOUCH_HANDLE_PX,
            marginLeft: -TOUCH_HANDLE_PX / 2,
            marginTop: -TOUCH_HANDLE_PX / 2,
          }}
          onPointerDown={beginResize}
          aria-label={`Изменить размер, угол ${i + 1}`}
        >
          <span className={touchResizeDotClass} />
        </div>
      ))}

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/80 text-gray-400 text-sm">
          Загрузка…
        </div>
      )}
    </div>
  );
}
