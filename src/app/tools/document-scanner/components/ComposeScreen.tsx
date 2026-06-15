"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PageOrientation, ScanItem } from "@/lib/document-scanner/types";
import { generateId } from "@/lib/document-scanner/constants";
import { blobToCanvas } from "@/lib/document-scanner/canvas-utils";
import {
  computeDrawSize,
  defaultComposePosition,
  defaultComposeWidthFrac,
  getAvailArea,
  getItemBounds,
  pointerToLocal,
  resolveWidthFrac,
  widthFracFromPointer,
} from "@/lib/document-scanner/layout-utils";
import { getPageAspectClass, getPreviewCanvasSize } from "@/lib/document-scanner/page-size";
import { btnOutline, btnPrimary, footerActions, footerBar, footerBtnBack, footerBtnNext, IconChevronLeft, IconChevronRight } from "./ScannerIcons";

interface Props {
  items: ScanItem[];
  orientation?: PageOrientation;
  onChange: (items: ScanItem[]) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export default function ComposeScreen({
  items,
  orientation = "portrait",
  onChange,
  onConfirm,
  onBack,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const [imageSizes, setImageSizes] = useState<Record<string, { w: number; h: number }>>({});
  const dragging = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, { w: number; h: number }> = {};
      for (const item of items) {
        const canvas = await blobToCanvas(item.imageBlob);
        next[item.id] = { w: canvas.width, h: canvas.height };
      }
      if (!cancelled) setImageSizes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = PAGE_W;
      canvas.height = PAGE_H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, PAGE_W, PAGE_H);

      for (const item of items) {
        const size = imageSizes[item.id];
        if (!size) continue;

        const widthFrac = resolveWidthFrac(item);
        const { drawW, drawH } = computeDrawSize(size.w, size.h, widthFrac, availW, availH);
        const cx = margin + item.x * availW;
        const cy = margin + item.y * availH;

        const imgCanvas = await blobToCanvas(item.imageBlob);
        if (cancelled) return;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((item.rotation * Math.PI) / 180);
        if (item.id === selectedId) {
          ctx.strokeStyle = "#111827";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(-drawW / 2 - 2, -drawH / 2 - 2, drawW + 4, drawH + 4);
          ctx.setLineDash([]);
        }
        ctx.drawImage(imgCanvas, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, imageSizes, selectedId, margin, availW, availH, PAGE_W, PAGE_H]);

  function updateItem(id: string, patch: Partial<ScanItem>) {
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function canvasPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * PAGE_W,
      y: ((clientY - rect.top) / rect.height) * PAGE_H,
    };
  }

  function hitTest(cx: number, cy: number): string | null {
    for (const item of [...items].reverse()) {
      const size = imageSizes[item.id];
      if (!size) continue;
      const { cx: px, cy: py, drawW, drawH } = getItemBounds(item, size.w, size.h, PAGE_W, PAGE_H);
      const local = pointerToLocal(cx, cy, px, py, item.rotation);
      if (Math.abs(local.x) <= drawW / 2 && Math.abs(local.y) <= drawH / 2) {
        return item.id;
      }
    }
    return null;
  }

  function applyResize(item: ScanItem, clientX: number, clientY: number) {
    const size = imageSizes[item.id];
    if (!size) return;
    const pt = canvasPoint(clientX, clientY);
    if (!pt) return;
    const { cx, cy } = getItemBounds(item, size.w, size.h, PAGE_W, PAGE_H);
    const local = pointerToLocal(pt.x, pt.y, cx, cy, item.rotation);
    updateItem(item.id, {
      widthFrac: widthFracFromPointer(
        cx,
        cy,
        cx + local.x,
        cy + local.y,
        size.w,
        size.h,
        availW,
        availH,
      ),
    });
  }

  const selected = items.find((i) => i.id === selectedId);
  const selectedSize = selected ? imageSizes[selected.id] : null;

  const resizeHandles =
    selected && selectedSize
      ? (() => {
          const { cx, cy, drawW, drawH } = getItemBounds(
            selected,
            selectedSize.w,
            selectedSize.h,
            PAGE_W,
            PAGE_H,
          );
          const rad = (selected.rotation * Math.PI) / 180;
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
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      <div className="px-4 py-3 text-center border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Объединение на странице</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Перемещайте объекты, тяните углы для изменения размера
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 bg-gray-50">
        <div className="relative w-full max-w-md">
          <canvas
            ref={canvasRef}
            width={PAGE_W}
            height={PAGE_H}
            className={`w-full ${aspectClass} border border-gray-200 rounded-xl shadow-sm bg-white touch-none`}
            onPointerDown={(e) => {
              const pt = canvasPoint(e.clientX, e.clientY);
              if (!pt) return;
              const hit = hitTest(pt.x, pt.y);
              if (hit) {
                const item = items.find((i) => i.id === hit)!;
                setSelectedId(hit);
                dragging.current = {
                  id: hit,
                  startX: e.clientX,
                  startY: e.clientY,
                  origX: item.x,
                  origY: item.y,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }
            }}
            onPointerMove={(e) => {
              if (!dragging.current || !canvasRef.current) return;
              const rect = canvasRef.current.getBoundingClientRect();
              const dx = (e.clientX - dragging.current.startX) / rect.width;
              const dy = (e.clientY - dragging.current.startY) / rect.height;
              updateItem(dragging.current.id, {
                x: Math.min(1, Math.max(0, dragging.current.origX + dx)),
                y: Math.min(1, Math.max(0, dragging.current.origY + dy)),
              });
            }}
            onPointerUp={() => {
              dragging.current = null;
            }}
          />

          {resizeHandles?.map((hp, i) => (
            <div
              key={i}
              className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-gray-900 border-[1.5px] border-white shadow-md cursor-nwse-resize z-10 touch-none"
              style={{
                left: `${(hp.x / PAGE_W) * 100}%`,
                top: `${(hp.y / PAGE_H) * 100}%`,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (selected) e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!selected || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
                applyResize(selected, e.clientX, e.clientY);
              }}
              onPointerUp={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              aria-label={`Изменить размер, угол ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {selected && (
        <div className="flex gap-2 px-4 py-2 justify-center flex-wrap border-t border-gray-100">
          <button
            type="button"
            onClick={() =>
              updateItem(selected.id, {
                widthFrac: Math.min(1, resolveWidthFrac(selected) + 0.05),
              })
            }
            className={btnOutline("px-3 py-1.5 text-xs")}
          >
            Увеличить
          </button>
          <button
            type="button"
            onClick={() =>
              updateItem(selected.id, {
                widthFrac: Math.max(0.05, resolveWidthFrac(selected) - 0.05),
              })
            }
            className={btnOutline("px-3 py-1.5 text-xs")}
          >
            Уменьшить
          </button>
          <button
            type="button"
            onClick={() =>
              updateItem(selected.id, { rotation: (selected.rotation + 90) % 360 })
            }
            className={btnOutline("px-3 py-1.5 text-xs")}
          >
            ↻ 90°
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(items.filter((i) => i.id !== selected.id));
              setSelectedId(items.find((i) => i.id !== selected.id)?.id ?? null);
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50"
          >
            Удалить
          </button>
        </div>
      )}

      <div className={footerBar()}>
        <div className={footerActions()}>
          <button type="button" onClick={onBack} className={footerBtnBack()}>
            <IconChevronLeft className="w-3.5 h-3.5" />
            Назад
          </button>
          <button type="button" onClick={onConfirm} className={footerBtnNext()}>
            Готово
            <IconChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function createScanItem(blob: Blob, index: number): ScanItem {
  const pos = defaultComposePosition(index);
  return {
    id: generateId(),
    imageBlob: blob,
    x: pos.x,
    y: pos.y,
    widthFrac: defaultComposeWidthFrac(index),
    rotation: 0,
  };
}
