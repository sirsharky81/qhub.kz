"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimePrecise, clampTime } from "@/lib/music-editor/format";
import type { TrimRegion } from "@/lib/music-editor/types";
import { WaveformLegend } from "./WaveformLegend";

type DragTarget = "playhead" | "trimStart" | "trimEnd" | "pendingCutStart" | "pendingCutEnd" | null;

interface WaveformEditorProps {
  peaks: number[];
  duration: number;
  currentTime: number;
  isPlaying?: boolean;
  trimStart: number;
  trimEnd: number | null;
  cutRegions: TrimRegion[];
  pendingCut: TrimRegion | null;
  onSeek: (time: number) => void;
  onTrimStartChange: (time: number) => void;
  onTrimEndChange: (time: number | null) => void;
  onPendingCutChange?: (cut: TrimRegion | null) => void;
  /** Живое время бегунка (без ожидания React). */
  getPlayheadTime?: () => number;
  height?: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 32;
const MARKER_HIT_PX = 14;

export function WaveformEditor({
  peaks,
  duration,
  currentTime,
  isPlaying = false,
  trimStart,
  trimEnd,
  cutRegions,
  pendingCut,
  onSeek,
  onTrimStartChange,
  onTrimEndChange,
  onPendingCutChange,
  getPlayheadTime,
  height = 120,
}: WaveformEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [viewStart, setViewStart] = useState(0);
  const dragRef = useRef<DragTarget>(null);
  const [dragPlayheadTime, setDragPlayheadTime] = useState<number | null>(null);

  const resolvePlayheadTime = useCallback(() => {
    if (dragPlayheadTime !== null) return dragPlayheadTime;
    return getPlayheadTime?.() ?? currentTime;
  }, [dragPlayheadTime, getPlayheadTime, currentTime]);

  const effectiveTrimEnd = trimEnd ?? duration;
  const visibleDuration = duration / zoom;
  const viewEnd = Math.min(duration, viewStart + visibleDuration);

  const clampViewStart = useCallback(
    (start: number) => Math.max(0, Math.min(start, duration - visibleDuration)),
    [duration, visibleDuration],
  );

  useEffect(() => {
    setViewStart((v) => clampViewStart(v));
  }, [zoom, clampViewStart]);

  useEffect(() => {
    if (currentTime < viewStart || currentTime > viewEnd) {
      setViewStart(clampViewStart(currentTime - visibleDuration / 2));
    }
  }, [currentTime, viewStart, viewEnd, visibleDuration, clampViewStart]);

  const timeToX = useCallback(
    (time: number, width: number) => ((time - viewStart) / visibleDuration) * width,
    [viewStart, visibleDuration],
  );

  const xToTime = useCallback(
    (x: number, width: number) => {
      const ratio = x / width;
      return clampTime(viewStart + ratio * visibleDuration, duration);
    },
    [viewStart, visibleDuration, duration],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || peaks.length === 0 || duration <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const mid = height / 2;
    const startIdx = Math.floor((viewStart / duration) * peaks.length);
    const endIdx = Math.ceil((viewEnd / duration) * peaks.length);
    const visiblePeaks = peaks.slice(startIdx, endIdx);
    const barWidth = width / Math.max(1, visiblePeaks.length);

    const isInKeep = (t: number) => {
      if (t < trimStart || t > effectiveTrimEnd) return false;
      return !cutRegions.some((c) => t >= c.start && t <= c.end);
    };

    const drawRegion = (start: number, end: number) => {
      const x1 = timeToX(Math.max(start, viewStart), width);
      const x2 = timeToX(Math.min(end, viewEnd), width);
      if (x2 > x1) ctx.fillRect(x1, 0, x2 - x1, height);
    };

    ctx.fillStyle = "rgba(229, 231, 235, 0.6)";
    ctx.fillRect(0, 0, width, height);

    for (const cut of cutRegions) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
      drawRegion(cut.start, cut.end);
    }

    if (pendingCut) {
      ctx.fillStyle = "rgba(245, 158, 11, 0.35)";
      drawRegion(pendingCut.start, pendingCut.end);
    }

    if (trimStart > viewStart) {
      ctx.fillStyle = "rgba(254, 226, 226, 0.75)";
      drawRegion(viewStart, trimStart);
    }
    if (effectiveTrimEnd < viewEnd) {
      ctx.fillStyle = "rgba(254, 226, 226, 0.75)";
      drawRegion(effectiveTrimEnd, viewEnd);
    }

    ctx.fillStyle = "rgba(16, 185, 129, 0.12)";
    drawRegion(trimStart, effectiveTrimEnd);

    for (let i = 0; i < visiblePeaks.length; i++) {
      const t = viewStart + (i / visiblePeaks.length) * visibleDuration;
      const x = i * barWidth;
      const barH = visiblePeaks[i] * (height * 0.82);
      const inCut = cutRegions.some((c) => t >= c.start && t <= c.end);
      const inPending = pendingCut ? t >= pendingCut.start && t <= pendingCut.end : false;
      const inTrim = isInKeep(t);

      if (inCut || inPending || !inTrim) ctx.fillStyle = "#fca5a5";
      else ctx.fillStyle = "#374151";

      ctx.fillRect(x, mid - barH / 2, Math.max(1, barWidth - 0.5), barH);
    }

    const drawMarker = (time: number, color: string, label: string) => {
      const px = timeToX(time, width);
      if (px < -4 || px > width + 4) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(px - 6, 0);
      ctx.lineTo(px + 6, 0);
      ctx.lineTo(px, 10);
      ctx.closePath();
      ctx.fill();
      ctx.font = "9px monospace";
      ctx.fillText(label, px + 4, 12);
    };

    drawMarker(trimStart, "#059669", "▶");
    drawMarker(effectiveTrimEnd, "#dc2626", "◼");

    if (pendingCut) {
      drawMarker(pendingCut.start, "#d97706", "↤");
      drawMarker(pendingCut.end, "#d97706", "↦");
    }

    const playTime = resolvePlayheadTime();
    const playX = timeToX(playTime, width);
    if (playX >= -8 && playX <= width + 8) {
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, height);
      ctx.stroke();
      ctx.fillStyle = "#2563eb";
      ctx.beginPath();
      ctx.arc(playX, height / 2, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }, [
    peaks,
    duration,
    trimStart,
    effectiveTrimEnd,
    trimEnd,
    cutRegions,
    pendingCut,
    height,
    viewStart,
    viewEnd,
    visibleDuration,
    timeToX,
    resolvePlayheadTime,
  ]);

  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw, currentTime, dragPlayheadTime]);

  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, draw]);

  const hitTest = (clientX: number): DragTarget => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const width = rect.width;

    const near = (time: number) => Math.abs(timeToX(time, width) - x) < MARKER_HIT_PX;

    if (near(resolvePlayheadTime())) return "playhead";
    if (near(trimStart)) return "trimStart";
    if (near(effectiveTrimEnd)) return "trimEnd";
    if (pendingCut && near(pendingCut.start)) return "pendingCutStart";
    if (pendingCut && near(pendingCut.end)) return "pendingCutEnd";
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const target = hitTest(e.clientX);
    dragRef.current = target ?? "playhead";
    e.currentTarget.setPointerCapture(e.pointerId);
    handlePointerMove(e.clientX, true);
  };

  const handlePointerMoveEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current) handlePointerMove(e.clientX, true);
  };

  const clearDrag = () => {
    dragRef.current = null;
    setDragPlayheadTime(null);
  };

  const handlePointerUpEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    clearDrag();
  };

  const handlePointerMove = (clientX: number, isDrag: boolean) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const time = xToTime(x, rect.width);
    const target = dragRef.current;

    if (!isDrag && !target) {
      return;
    }

    switch (target) {
      case "trimStart":
        onTrimStartChange(clampTime(Math.min(time, effectiveTrimEnd - 0.1), duration));
        break;
      case "trimEnd": {
        const t = clampTime(Math.max(time, trimStart + 0.1), duration);
        onTrimEndChange(t >= duration - 0.05 ? null : t);
        break;
      }
      case "pendingCutStart":
        if (pendingCut && onPendingCutChange) {
          onPendingCutChange({
            start: clampTime(Math.min(time, pendingCut.end - 0.1), duration),
            end: pendingCut.end,
          });
        }
        break;
      case "pendingCutEnd":
        if (pendingCut && onPendingCutChange) {
          onPendingCutChange({
            start: pendingCut.start,
            end: clampTime(Math.max(time, pendingCut.start + 0.1), duration),
          });
        }
        break;
      case "playhead":
      default:
        setDragPlayheadTime(time);
        onSeek(time);
        break;
    }
  };

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z * 2));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, z / 2));

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    } else if (zoom > 1) {
      e.preventDefault();
      setViewStart((v) => clampViewStart(v + (e.deltaY / 500) * visibleDuration));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="w-7 h-7 rounded-lg border border-gray-200 text-xs hover:bg-gray-50 disabled:opacity-40"
            aria-label="Уменьшить"
          >
            −
          </button>
          <span className="text-[10px] font-mono text-gray-500 w-10 text-center">{zoom}×</span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="w-7 h-7 rounded-lg border border-gray-200 text-xs hover:bg-gray-50 disabled:opacity-40"
            aria-label="Увеличить"
          >
            +
          </button>
        </div>
        <WaveformLegend />
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50"
        onWheel={handleWheel}
      >
        <div ref={containerRef} className="relative min-w-full" style={{ minWidth: zoom > 1 ? `${zoom * 100}%` : "100%" }}>
          <canvas
            ref={canvasRef}
            className="w-full touch-none select-none cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMoveEvent}
            onPointerUp={handlePointerUpEvent}
            onPointerCancel={handlePointerUpEvent}
          />
        </div>
      </div>

      <div className="flex justify-between text-[10px] font-mono text-gray-400 px-1">
        <span>{formatTimePrecise(viewStart)}</span>
        <span>{formatTimePrecise(viewEnd)}</span>
      </div>
    </div>
  );
}
