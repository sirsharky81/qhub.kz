"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { exportCroppedAvatar, type AvatarPanZoom } from "@/lib/messenger/avatar-compress";

const VIEWPORT = 280;
const MAX_ZOOM = 4;

interface Props {
  open: boolean;
  file: File | null;
  onCancel: () => void;
  onConfirm: (blob: Blob, mime: string) => void;
  busy?: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function minCoverScale(nw: number, nh: number): number {
  return Math.max(VIEWPORT / nw, VIEWPORT / nh);
}

function clampPanZoom(t: AvatarPanZoom, nw: number, nh: number, minScale: number): AvatarPanZoom {
  const scale = clamp(t.scale, minScale, minScale * MAX_ZOOM);
  const w = nw * scale;
  const h = nh * scale;
  return {
    scale,
    cx: clamp(t.cx, VIEWPORT - w / 2, w / 2),
    cy: clamp(t.cy, VIEWPORT - h / 2, h / 2),
  };
}

function initialTransform(nw: number, nh: number): AvatarPanZoom {
  return { scale: minCoverScale(nw, nh), cx: VIEWPORT / 2, cy: VIEWPORT / 2 };
}

function zoomAt(
  t: AvatarPanZoom,
  focalX: number,
  focalY: number,
  newScale: number,
  nw: number,
  nh: number,
): AvatarPanZoom {
  const ratio = newScale / t.scale;
  return clampPanZoom(
    {
      scale: newScale,
      cx: focalX - (focalX - t.cx) * ratio,
      cy: focalY - (focalY - t.cy) * ratio,
    },
    nw,
    nh,
    minCoverScale(nw, nh),
  );
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  nw: number,
  nh: number,
  t: AvatarPanZoom,
) {
  ctx.clearRect(0, 0, VIEWPORT, VIEWPORT);
  ctx.fillStyle = "#0b141a";
  ctx.fillRect(0, 0, VIEWPORT, VIEWPORT);

  ctx.save();
  ctx.beginPath();
  ctx.arc(VIEWPORT / 2, VIEWPORT / 2, VIEWPORT / 2 - 1, 0, Math.PI * 2);
  ctx.clip();

  const w = nw * t.scale;
  const h = nh * t.scale;
  ctx.drawImage(img, t.cx - w / 2, t.cy - h / 2, w, h);
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(VIEWPORT / 2, VIEWPORT / 2, VIEWPORT / 2 - 1, 0, Math.PI * 2);
  ctx.stroke();
}

export function AvatarCropModal({ open, file, onCancel, onConfirm, busy }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const naturalRef = useRef({ w: 0, h: 0 });
  const transformRef = useRef<AvatarPanZoom>({ scale: 1, cx: VIEWPORT / 2, cy: VIEWPORT / 2 });
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; transform: AvatarPanZoom } | null>(null);
  const panRef = useRef<{ x: number; y: number; transform: AvatarPanZoom } | null>(null);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const bitmap = bitmapRef.current;
    const { w, h } = naturalRef.current;
    if (!canvas || !bitmap || !w || !h) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawFrame(ctx, bitmap, w, h, transformRef.current);
  }, []);

  useEffect(() => {
    if (!open || !file) {
      bitmapRef.current?.close();
      bitmapRef.current = null;
      setReady(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const bitmap = await createImageBitmap(file);
      if (cancelled) {
        bitmap.close();
        return;
      }
      bitmapRef.current = bitmap;
      naturalRef.current = { w: bitmap.width, h: bitmap.height };
      transformRef.current = initialTransform(bitmap.width, bitmap.height);
      setReady(true);
      requestAnimationFrame(redraw);
    })();

    return () => {
      cancelled = true;
      bitmapRef.current?.close();
      bitmapRef.current = null;
    };
  }, [open, file, redraw]);

  useEffect(() => {
    if (ready) redraw();
  }, [ready, redraw]);

  function canvasPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = VIEWPORT / rect.width;
    const sy = VIEWPORT / rect.height;
    return {
      x: (clientX - rect.left) * sx,
      y: (clientY - rect.top) * sy,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (busy || exporting) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = canvasPoint(e.clientX, e.clientY);
    if (!pt) return;
    pointersRef.current.set(e.pointerId, pt);

    if (pointersRef.current.size === 1) {
      panRef.current = { x: pt.x, y: pt.y, transform: { ...transformRef.current } };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      pinchRef.current = { dist: Math.hypot(dx, dy), transform: { ...transformRef.current } };
      panRef.current = null;
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (busy || exporting) return;
    const pt = canvasPoint(e.clientX, e.clientY);
    if (!pt) return;
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, pt);

    const { w, h } = naturalRef.current;
    const minScale = minCoverScale(w, h);

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const pts = [...pointersRef.current.values()];
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.hypot(dx, dy);
      if (pinchRef.current.dist <= 0) return;
      const focalX = (pts[0].x + pts[1].x) / 2;
      const focalY = (pts[0].y + pts[1].y) / 2;
      const newScale = clamp(
        pinchRef.current.transform.scale * (dist / pinchRef.current.dist),
        minScale,
        minScale * MAX_ZOOM,
      );
      transformRef.current = zoomAt(
        pinchRef.current.transform,
        focalX,
        focalY,
        newScale,
        w,
        h,
      );
      redraw();
      return;
    }

    if (pointersRef.current.size === 1 && panRef.current) {
      const dx = pt.x - panRef.current.x;
      const dy = pt.y - panRef.current.y;
      transformRef.current = clampPanZoom(
        {
          ...panRef.current.transform,
          cx: panRef.current.transform.cx + dx,
          cy: panRef.current.transform.cy + dy,
        },
        w,
        h,
        minScale,
      );
      redraw();
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) panRef.current = null;
    if (pointersRef.current.size === 1) {
      const remaining = [...pointersRef.current.entries()][0];
      if (remaining) {
        panRef.current = {
          x: remaining[1].x,
          y: remaining[1].y,
          transform: { ...transformRef.current },
        };
      }
    }
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    if (busy || exporting) return;
    e.preventDefault();
    const pt = canvasPoint(e.clientX, e.clientY);
    if (!pt) return;
    const { w, h } = naturalRef.current;
    const minScale = minCoverScale(w, h);
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const newScale = clamp(transformRef.current.scale * factor, minScale, minScale * MAX_ZOOM);
    transformRef.current = zoomAt(transformRef.current, pt.x, pt.y, newScale, w, h);
    redraw();
  }

  async function handleSave() {
    const bitmap = bitmapRef.current;
    const { w, h } = naturalRef.current;
    if (!bitmap || !w || !h) return;
    setExporting(true);
    try {
      const { blob, mime } = await exportCroppedAvatar(
        bitmap,
        w,
        h,
        transformRef.current,
        VIEWPORT,
      );
      onConfirm(blob, mime);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  }

  if (!open) return null;

  const content = (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white shadow-xl overflow-hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="px-4 pt-4 pb-2">
          <h2 className="text-base font-semibold text-gray-900">Позиция фото</h2>
          <p className="text-xs text-gray-500 mt-1">
            Двигайте и масштабируйте фото внутри круга. Сохраните, когда всё устроит.
          </p>
        </div>

        <div className="flex justify-center bg-[#0b141a] py-4">
          <canvas
            ref={canvasRef}
            width={VIEWPORT}
            height={VIEWPORT}
            className="touch-none select-none block mx-auto"
            style={{ width: VIEWPORT, height: VIEWPORT, maxWidth: "min(280px, 85vw)" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          />
        </div>

        {!ready && (
          <p className="text-center text-xs text-gray-400 pb-2">Загрузка изображения…</p>
        )}

        <div className="flex gap-2 p-4">
          <button
            type="button"
            disabled={busy || exporting}
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-gray-200 py-3 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy || exporting || !ready}
            onClick={() => void handleSave()}
            className="flex-1 rounded-2xl bg-gray-900 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy || exporting ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
