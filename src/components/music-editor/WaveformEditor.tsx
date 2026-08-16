"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import { formatTimePrecise, formatTimeMs, clampTime, snapToBeat } from "@/lib/music-editor/format";
import { PeaksLodCache, computePeaks } from "@/lib/music-editor/waveform";
import type { BeatGrid, EditRegion, TrimRegion } from "@/lib/music-editor/types";
import { describeEditRegion } from "@/lib/music-editor/selection";
import { WaveformLegend } from "./WaveformLegend";

type DragTarget =
  | "playhead"
  | "trimStart"
  | "trimEnd"
  | "loopStart"
  | "loopEnd"
  | "minimap"
  | null;

export interface WaveformEditorHandle {
  zoomToPlayhead: () => void;
  zoomToSelection: () => void;
  nudgePlayhead: (deltaSec: number) => void;
}

interface WaveformEditorProps {
  buffer: AudioBuffer;
  peaks: number[];
  duration: number;
  currentTime: number;
  isPlaying?: boolean;
  trimStart: number;
  trimEnd: number | null;
  cutRegions: TrimRegion[];
  loopRegion: TrimRegion | null;
  editRegions?: EditRegion[];
  processedBuffer?: AudioBuffer | null;
  resultCurrentTime?: number;
  onResultSeek?: (time: number) => void;
  beatGrid?: BeatGrid | null;
  snapToBeat?: boolean;
  onSeek: (time: number) => void;
  onTrimStartChange: (time: number) => void;
  onTrimEndChange: (time: number | null) => void;
  onLoopRegionChange?: (region: TrimRegion | null) => void;
  getPlayheadTime?: () => number;
  height?: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 128;
const MARKER_HIT_PX = 14;
const SELECTION_HANDLE_HIT_PX = 26;
const MINIMAP_HEIGHT = 32;

function applySnap(time: number, beatGrid: BeatGrid | null | undefined, snap: boolean): number {
  if (!snap || !beatGrid || beatGrid.bpm <= 0) return time;
  return snapToBeat(time, beatGrid.bpm, beatGrid.offset);
}

export const WaveformEditor = forwardRef<WaveformEditorHandle, WaveformEditorProps>(
  function WaveformEditor(
    {
      buffer,
      peaks,
      duration,
      currentTime,
      isPlaying = false,
      trimStart,
      trimEnd,
      cutRegions,
      loopRegion,
      editRegions = [],
      processedBuffer = null,
      resultCurrentTime = 0,
      onResultSeek,
      beatGrid,
      snapToBeat: snapEnabled = false,
      onSeek,
      onTrimStartChange,
      onTrimEndChange,
      onLoopRegionChange,
      getPlayheadTime,
      height = 140,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const minimapRef = useRef<HTMLCanvasElement>(null);
    const resultCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lodCacheRef = useRef(new PeaksLodCache());
    const [zoom, setZoom] = useState(1);
    const [viewStart, setViewStart] = useState(0);
    const dragRef = useRef<DragTarget>(null);
    const selectionDragRef = useRef<{ start: number; end: number } | null>(null);
    const [dragPlayheadTime, setDragPlayheadTime] = useState<number | null>(null);
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipTime, setTooltipTime] = useState(0);
    const [tooltipX, setTooltipX] = useState(0);
    const pinchRef = useRef<{ dist: number; initialZoom: number } | null>(null);
    const minimapDragRef = useRef<"pan" | "resize-left" | "resize-right" | null>(null);
    const currentTimePropRef = useRef(currentTime);
    const getPlayheadTimeRef = useRef(getPlayheadTime);
    currentTimePropRef.current = currentTime;
    getPlayheadTimeRef.current = getPlayheadTime;

    const effectiveTrimEnd = trimEnd ?? duration;
    const visibleDuration = duration / zoom;
    const viewEnd = Math.min(duration, viewStart + visibleDuration);

    const clampViewStart = useCallback(
      (start: number) => Math.max(0, Math.min(start, Math.max(0, duration - visibleDuration))),
      [duration, visibleDuration],
    );

    const resolvePlayheadTime = useCallback(() => {
      if (dragPlayheadTime !== null) return dragPlayheadTime;
      return getPlayheadTimeRef.current?.() ?? currentTimePropRef.current;
    }, [dragPlayheadTime]);

    useEffect(() => {
      lodCacheRef.current.clear();
    }, [buffer]);

    useEffect(() => {
      setViewStart((v) => clampViewStart(v));
    }, [zoom, clampViewStart]);

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

    const zoomAt = useCallback(
      (factor: number, anchorTime: number) => {
        const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
        if (nextZoom === zoom) return;
        const nextVisible = duration / nextZoom;
        const anchorRatio = (anchorTime - viewStart) / visibleDuration;
        const nextStart = anchorTime - anchorRatio * nextVisible;
        setZoom(nextZoom);
        setViewStart(Math.max(0, Math.min(nextStart, duration - nextVisible)));
      },
      [duration, viewStart, visibleDuration, zoom],
    );

    const zoomToPlayhead = useCallback(() => {
      const t = resolvePlayheadTime();
      setViewStart(clampViewStart(t - visibleDuration / 2));
    }, [resolvePlayheadTime, clampViewStart, visibleDuration]);

    const zoomToSelection = useCallback(() => {
      const selStart = trimStart;
      const selEnd = effectiveTrimEnd;
      const selDur = Math.max(0.5, selEnd - selStart);
      const padding = selDur * 0.1;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, duration / (selDur + padding * 2)));
      setZoom(newZoom);
      const vis = duration / newZoom;
      setViewStart(Math.max(0, Math.min(selStart - padding, duration - vis)));
    }, [trimStart, effectiveTrimEnd, duration]);

    const nudgePlayhead = useCallback(
      (deltaSec: number) => {
        const t = applySnap(
          clampTime(resolvePlayheadTime() + deltaSec, duration),
          beatGrid,
          snapEnabled,
        );
        onSeek(t);
      },
      [resolvePlayheadTime, duration, beatGrid, snapEnabled, onSeek],
    );

    useImperativeHandle(ref, () => ({ zoomToPlayhead, zoomToSelection, nudgePlayhead }), [
      zoomToPlayhead,
      zoomToSelection,
      nudgePlayhead,
    ]);

    const drawMinimap = useCallback(() => {
      const canvas = minimapRef.current;
      const container = containerRef.current;
      if (!canvas || !container || peaks.length === 0 || duration <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      canvas.width = width * dpr;
      canvas.height = MINIMAP_HEIGHT * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${MINIMAP_HEIGHT}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, MINIMAP_HEIGHT);

      const mid = MINIMAP_HEIGHT / 2;
      const barW = width / peaks.length;

      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(0, 0, width, MINIMAP_HEIGHT);

      const mapX = (t: number) => (t / duration) * width;

      ctx.fillStyle = "rgba(254, 226, 226, 0.8)";
      if (trimStart > 0) ctx.fillRect(0, 0, mapX(trimStart), MINIMAP_HEIGHT);
      if (effectiveTrimEnd < duration) {
        ctx.fillRect(mapX(effectiveTrimEnd), 0, width - mapX(effectiveTrimEnd), MINIMAP_HEIGHT);
      }

      ctx.fillStyle = "rgba(16, 185, 129, 0.2)";
      ctx.fillRect(mapX(trimStart), 0, mapX(effectiveTrimEnd) - mapX(trimStart), MINIMAP_HEIGHT);

      for (const cut of cutRegions) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.45)";
        ctx.fillRect(mapX(cut.start), 0, mapX(cut.end) - mapX(cut.start), MINIMAP_HEIGHT);
      }

      if (loopRegion) {
        ctx.fillStyle = "rgba(99, 102, 241, 0.45)";
        ctx.fillRect(
          mapX(loopRegion.start),
          0,
          mapX(loopRegion.end) - mapX(loopRegion.start),
          MINIMAP_HEIGHT,
        );
      }

      for (const region of editRegions) {
        ctx.fillStyle = "rgba(245, 158, 11, 0.4)";
        ctx.fillRect(
          mapX(region.start),
          0,
          mapX(region.end) - mapX(region.start),
          MINIMAP_HEIGHT,
        );
      }

      for (let i = 0; i < peaks.length; i++) {
        const x = i * barW;
        const barH = peaks[i] * (MINIMAP_HEIGHT * 0.7);
        ctx.fillStyle = "#9ca3af";
        ctx.fillRect(x, mid - barH / 2, Math.max(1, barW - 0.5), barH);
      }

      const playX = mapX(resolvePlayheadTime());
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, MINIMAP_HEIGHT);
      ctx.stroke();

      const vx1 = mapX(viewStart);
      const vx2 = mapX(viewEnd);
      ctx.fillStyle = "rgba(37, 99, 235, 0.12)";
      ctx.fillRect(vx1, 0, vx2 - vx1, MINIMAP_HEIGHT);
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1;
      ctx.strokeRect(vx1 + 0.5, 0.5, Math.max(4, vx2 - vx1 - 1), MINIMAP_HEIGHT - 1);
    }, [
      peaks,
      duration,
      trimStart,
      effectiveTrimEnd,
      cutRegions,
      loopRegion,
      editRegions,
      viewStart,
      viewEnd,
      resolvePlayheadTime,
    ]);

    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || duration <= 0) return;

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
      const barCount = Math.max(1, Math.ceil(width));
      const visiblePeaks = lodCacheRef.current.get(buffer, viewStart, viewEnd, barCount);
      const barWidth = width / visiblePeaks.length;

      const isInKeep = (t: number) => {
        if (t < trimStart || t > effectiveTrimEnd) return false;
        return !cutRegions.some((c) => t >= c.start && t <= c.end);
      };

      const drawRegion = (start: number, end: number, color: string) => {
        const x1 = timeToX(Math.max(start, viewStart), width);
        const x2 = timeToX(Math.min(end, viewEnd), width);
        if (x2 > x1) {
          ctx.fillStyle = color;
          ctx.fillRect(x1, 0, x2 - x1, height);
        }
      };

      ctx.fillStyle = "rgba(229, 231, 235, 0.6)";
      ctx.fillRect(0, 0, width, height);

      for (const cut of cutRegions) drawRegion(cut.start, cut.end, "rgba(239, 68, 68, 0.25)");
      for (const region of editRegions) drawRegion(region.start, region.end, "rgba(245, 158, 11, 0.22)");
      if (loopRegion) drawRegion(loopRegion.start, loopRegion.end, "rgba(244, 63, 94, 0.28)");
      if (trimStart > viewStart) drawRegion(viewStart, trimStart, "rgba(254, 226, 226, 0.75)");
      if (effectiveTrimEnd < viewEnd) drawRegion(effectiveTrimEnd, viewEnd, "rgba(254, 226, 226, 0.75)");
      drawRegion(trimStart, effectiveTrimEnd, "rgba(16, 185, 129, 0.12)");

      if (beatGrid && beatGrid.bpm > 0) {
        const beatInterval = 60 / beatGrid.bpm;
        const firstBeat = Math.floor((viewStart - beatGrid.offset) / beatInterval);
        const lastBeat = Math.ceil((viewEnd - beatGrid.offset) / beatInterval);
        for (let n = firstBeat; n <= lastBeat; n++) {
          const t = beatGrid.offset + n * beatInterval;
          if (t < viewStart - 0.001 || t > viewEnd + 0.001) continue;
          const px = timeToX(t, width);
          const isBar = n % 4 === 0;
          ctx.strokeStyle = isBar ? "rgba(99, 102, 241, 0.55)" : "rgba(99, 102, 241, 0.2)";
          ctx.lineWidth = isBar ? 1.5 : 1;
          ctx.beginPath();
          ctx.moveTo(px, 0);
          ctx.lineTo(px, height);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(99, 102, 241, 0.85)";
        ctx.font = "9px monospace";
        ctx.fillText(`${Math.round(beatGrid.bpm)} BPM`, 6, 12);
      }

      for (let i = 0; i < visiblePeaks.length; i++) {
        const t = viewStart + (i / visiblePeaks.length) * visibleDuration;
        const x = i * barWidth;
        const peak = visiblePeaks[i];
        const top = mid - peak.max * (height * 0.42);
        const bottom = mid - peak.min * (height * 0.42);
        const inCut = cutRegions.some((c) => t >= c.start && t <= c.end);
        const inLoop = loopRegion ? t >= loopRegion.start && t <= loopRegion.end : false;
        const inEdit = editRegions.some((r) => t >= r.start && t <= r.end);
        const inTrim = isInKeep(t);

        if (inCut || !inTrim) ctx.fillStyle = "#fca5a5";
        else if (inLoop) ctx.fillStyle = "#e11d48";
        else if (inEdit) ctx.fillStyle = "#d97706";
        else ctx.fillStyle = "#374151";
        ctx.fillRect(x, top, Math.max(1, barWidth - 0.5), bottom - top);
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
      if (loopRegion) {
        const handleR = 11;
        const startHandleY = handleR + 10;
        const endHandleY = height - handleR - 10;
        const drawSelectionHandle = (time: number, cy: number) => {
          const px = timeToX(time, width);
          if (px < -12 || px > width + 12) return;
          ctx.strokeStyle = "#e11d48";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(px, 6);
          ctx.lineTo(px, height - 6);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px, cy, handleR, 0, Math.PI * 2);
          ctx.fillStyle = "#e11d48";
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 1.5;
          ctx.moveTo(px - 3.5, cy - 4);
          ctx.lineTo(px - 3.5, cy + 4);
          ctx.moveTo(px + 3.5, cy - 4);
          ctx.lineTo(px + 3.5, cy + 4);
          ctx.stroke();
        };
        drawSelectionHandle(loopRegion.start, startHandleY);
        drawSelectionHandle(loopRegion.end, endHandleY);
      }

      ctx.font = "9px monospace";
      for (const region of editRegions) {
        const x1 = timeToX(Math.max(region.start, viewStart), width);
        const x2 = timeToX(Math.min(region.end, viewEnd), width);
        if (x2 - x1 < 8) continue;
        ctx.fillStyle = "rgba(146, 64, 14, 0.9)";
        ctx.fillText(describeEditRegion(region), x1 + 4, height - 8);
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
      buffer,
      duration,
      trimStart,
      effectiveTrimEnd,
      cutRegions,
      loopRegion,
      editRegions,
      height,
      viewStart,
      viewEnd,
      visibleDuration,
      timeToX,
      resolvePlayheadTime,
      beatGrid,
    ]);

    const resultPeaks = useMemo(() => {
      if (!processedBuffer) return [];
      return computePeaks(processedBuffer, 320);
    }, [processedBuffer]);

    const resultTimeRef = useRef(resultCurrentTime);
    resultTimeRef.current = resultCurrentTime;

    const drawResult = useCallback(() => {
      const canvas = resultCanvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const stripH = 44;
      canvas.width = width * dpr;
      canvas.height = stripH * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${stripH}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, stripH);
      ctx.fillStyle = "#fffbeb";
      ctx.fillRect(0, 0, width, stripH);

      if (resultPeaks.length === 0 || !processedBuffer) {
        ctx.fillStyle = "#b45309";
        ctx.font = "10px sans-serif";
        ctx.fillText("Результат появится после обработки", 8, 26);
        return;
      }

      const barW = width / resultPeaks.length;
      const mid = stripH / 2;
      for (let i = 0; i < resultPeaks.length; i++) {
        const barH = resultPeaks[i] * (stripH * 0.72);
        ctx.fillStyle = "#d97706";
        ctx.fillRect(i * barW, mid - barH / 2, Math.max(1, barW - 0.4), barH);
      }

      const playX = (Math.max(0, resultTimeRef.current) / processedBuffer.duration) * width;
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, stripH);
      ctx.stroke();

      ctx.fillStyle = "#92400e";
      ctx.font = "9px sans-serif";
      ctx.fillText(`После правки · ${formatTimePrecise(processedBuffer.duration)}`, 6, 11);
    }, [processedBuffer, resultPeaks]);

    useEffect(() => {
      draw();
      drawMinimap();
      drawResult();
      const observer = new ResizeObserver(() => {
        draw();
        drawMinimap();
        drawResult();
      });
      if (containerRef.current) observer.observe(containerRef.current);
      return () => observer.disconnect();
    }, [draw, drawMinimap, drawResult]);

    useEffect(() => {
      if (isPlaying) return;
      draw();
      drawMinimap();
      drawResult();
    }, [isPlaying, currentTime, dragPlayheadTime, draw, drawMinimap, drawResult]);

    useEffect(() => {
      if (!isPlaying) return;
      let raf = 0;
      const loop = () => {
        const playTime = resolvePlayheadTime();
        setViewStart((v) => {
          const vis = duration / zoom;
          const end = v + vis;
          if (playTime >= v && playTime <= end) return v;
          return clampViewStart(playTime - vis / 2);
        });
        draw();
        drawMinimap();
        drawResult();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }, [isPlaying, draw, drawMinimap, drawResult, resolvePlayheadTime, duration, zoom, clampViewStart]);

    const hitTest = (clientX: number, clientY: number): DragTarget => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const w = rect.width;
      const near = (time: number, px = MARKER_HIT_PX) => Math.abs(timeToX(time, w) - x) < px;

      if (loopRegion && onLoopRegionChange) {
        const nearX = (time: number) => near(time, SELECTION_HANDLE_HIT_PX);
        if (nearX(loopRegion.start) && y < height * 0.45) return "loopStart";
        if (nearX(loopRegion.end) && y > height * 0.55) return "loopEnd";
      }
      if (near(trimStart)) return "trimStart";
      if (near(effectiveTrimEnd)) return "trimEnd";
      if (near(resolvePlayheadTime())) return "playhead";
      return null;
    };

    const applyTime = (rawTime: number, target: DragTarget): number => {
      let time = clampTime(rawTime, duration);
      if (snapEnabled && beatGrid && (target === "playhead" || target === "trimStart" || target === "trimEnd" || target === "loopStart" || target === "loopEnd")) {
        time = applySnap(time, beatGrid, true);
      }
      return time;
    };

    const handlePointerMove = (clientX: number, isDrag: boolean) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const rawTime = xToTime(x, rect.width);
      const target = dragRef.current;

      if (!isDrag && !target) return;

      switch (target) {
        case "trimStart": {
          const time = applyTime(rawTime, target);
          onTrimStartChange(clampTime(Math.min(time, effectiveTrimEnd - 0.01), duration));
          break;
        }
        case "trimEnd": {
          const time = applyTime(rawTime, target);
          const t = clampTime(Math.max(time, trimStart + 0.01), duration);
          onTrimEndChange(t >= duration - 0.001 ? null : t);
          break;
        }
        case "loopStart":
          if (onLoopRegionChange) {
            const origin = selectionDragRef.current ?? loopRegion;
            if (!origin) break;
            const time = applyTime(rawTime, target);
            const next = {
              start: clampTime(Math.min(time, origin.end - 0.01), duration),
              end: origin.end,
            };
            selectionDragRef.current = next;
            onLoopRegionChange(next);
          }
          break;
        case "loopEnd":
          if (onLoopRegionChange) {
            const origin = selectionDragRef.current ?? loopRegion;
            if (!origin) break;
            const time = applyTime(rawTime, target);
            const next = {
              start: origin.start,
              end: clampTime(Math.max(time, origin.start + 0.01), duration),
            };
            selectionDragRef.current = next;
            onLoopRegionChange(next);
          }
          break;
        case "playhead":
        default: {
          const time = applyTime(rawTime, "playhead");
          setDragPlayheadTime(time);
          setTooltipTime(time);
          setTooltipX(x);
          setShowTooltip(true);
          onSeek(time);
          break;
        }
      }
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const target = hitTest(e.clientX, e.clientY);
      dragRef.current = target ?? "playhead";
      if (loopRegion && (target === "loopStart" || target === "loopEnd")) {
        selectionDragRef.current = { start: loopRegion.start, end: loopRegion.end };
      } else {
        selectionDragRef.current = null;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      handlePointerMove(e.clientX, true);
    };

    const clearDrag = () => {
      dragRef.current = null;
      selectionDragRef.current = null;
      setDragPlayheadTime(null);
      setShowTooltip(false);
    };

    const handlePointerUpEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.stopPropagation();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      clearDrag();
    };

    const handleWheel = (e: React.WheelEvent) => {
      const container = containerRef.current;
      if (!container) return;

      if (e.shiftKey) {
        e.preventDefault();
        setViewStart((v) => clampViewStart(v + (e.deltaY / 500) * visibleDuration));
        return;
      }

      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const anchorTime = xToTime(x, rect.width);
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      zoomAt(factor, anchorTime);
    };

    const handleMinimapPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = minimapRef.current;
      if (!canvas || duration <= 0) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const w = rect.width;
      const vx1 = (viewStart / duration) * w;
      const vx2 = (viewEnd / duration) * w;
      const edge = 6;

      if (Math.abs(x - vx1) < edge) minimapDragRef.current = "resize-left";
      else if (Math.abs(x - vx2) < edge) minimapDragRef.current = "resize-right";
      else if (x >= vx1 && x <= vx2) minimapDragRef.current = "pan";
      else {
        const clickTime = (x / w) * duration;
        setViewStart(clampViewStart(clickTime - visibleDuration / 2));
        minimapDragRef.current = "pan";
      }

      dragRef.current = "minimap";
      e.currentTarget.setPointerCapture(e.pointerId);
      handleMinimapPointerMove(e.clientX);
    };

    const handleMinimapPointerMove = (clientX: number) => {
      const canvas = minimapRef.current;
      if (!canvas || !minimapDragRef.current || duration <= 0) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const time = (x / rect.width) * duration;

      if (minimapDragRef.current === "pan") {
        setViewStart(clampViewStart(time - visibleDuration / 2));
      } else if (minimapDragRef.current === "resize-left") {
        const newStart = Math.min(time, viewEnd - 0.25);
        const newZoom = duration / (viewEnd - newStart);
        if (newZoom >= MIN_ZOOM && newZoom <= MAX_ZOOM) {
          setZoom(newZoom);
          setViewStart(newStart);
        }
      } else if (minimapDragRef.current === "resize-right") {
        const newEnd = Math.max(time, viewStart + 0.25);
        const newZoom = duration / (newEnd - viewStart);
        if (newZoom >= MIN_ZOOM && newZoom <= MAX_ZOOM) {
          setZoom(newZoom);
        }
      }
    };

    const handleMinimapUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      minimapDragRef.current = null;
      dragRef.current = null;
    };

    const handleTouchStart = (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = { dist: Math.hypot(dx, dy), initialZoom: zoom };
      }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current || !containerRef.current) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / pinchRef.current.dist;
      const targetZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, pinchRef.current.initialZoom * factor),
      );
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const rect = containerRef.current.getBoundingClientRect();
      const anchorTime = xToTime(midX - rect.left, rect.width);
      const currentFactor = targetZoom / zoom;
      if (Math.abs(currentFactor - 1) > 0.01) {
        zoomAt(currentFactor, anchorTime);
      }
    };

    const handleTouchEnd = () => {
      pinchRef.current = null;
    };

    const zoomIn = () => {
      zoomAt(2, resolvePlayheadTime());
    };

    const zoomOut = () => {
      zoomAt(0.5, resolvePlayheadTime());
    };

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoom <= MIN_ZOOM}
              className="w-7 h-7 rounded-lg border border-gray-200 text-xs hover:bg-gray-50 disabled:opacity-40"
              aria-label="Уменьшить"
            >
              −
            </button>
            <span className="text-[10px] font-mono text-gray-500 w-12 text-center">
              {zoom >= 10 ? `${Math.round(zoom)}×` : `${zoom.toFixed(1)}×`}
            </span>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoom >= MAX_ZOOM}
              className="w-7 h-7 rounded-lg border border-gray-200 text-xs hover:bg-gray-50 disabled:opacity-40"
              aria-label="Увеличить"
            >
              +
            </button>
            <button
              type="button"
              onClick={zoomToPlayhead}
              className="px-2 py-1 rounded-lg border border-gray-200 text-[10px] hover:bg-gray-50"
            >
              К курсору
            </button>
            <button
              type="button"
              onClick={zoomToSelection}
              className="px-2 py-1 rounded-lg border border-gray-200 text-[10px] hover:bg-gray-50"
            >
              К выделению
            </button>
          </div>
          <WaveformLegend />
        </div>

        <div
          className="relative rounded-xl border border-gray-200 bg-gray-50 overflow-hidden"
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div ref={containerRef} className="relative w-full">
            <canvas
              ref={canvasRef}
              className="w-full touch-none select-none cursor-crosshair"
              onPointerDown={handlePointerDown}
              onPointerMove={(e) => dragRef.current && handlePointerMove(e.clientX, true)}
              onPointerUp={handlePointerUpEvent}
              onPointerCancel={handlePointerUpEvent}
            />
            {showTooltip && dragRef.current === "playhead" && (
              <div
                className="absolute top-1 pointer-events-none px-1.5 py-0.5 rounded bg-gray-900 text-white text-[10px] font-mono -translate-x-1/2"
                style={{ left: tooltipX }}
              >
                {formatTimeMs(tooltipTime)}
              </div>
            )}
          </div>
          <canvas
            ref={resultCanvasRef}
            className="w-full border-t border-amber-200 cursor-pointer touch-none"
            onPointerDown={(e) => {
              if (!processedBuffer || !onResultSeek) return;
              e.preventDefault();
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
              onResultSeek((x / rect.width) * processedBuffer.duration);
            }}
            aria-label="Волна результата"
          />
          <canvas
            ref={minimapRef}
            className="w-full border-t border-gray-200 cursor-pointer touch-none"
            onPointerDown={handleMinimapPointerDown}
            onPointerMove={(e) => minimapDragRef.current && handleMinimapPointerMove(e.clientX)}
            onPointerUp={handleMinimapUp}
            onPointerCancel={handleMinimapUp}
          />
        </div>

        <div className="flex justify-between text-[10px] font-mono text-gray-400 px-1">
          <span>{formatTimePrecise(viewStart)}</span>
          <span>{formatTimeMs(resolvePlayheadTime())}</span>
          <span>{formatTimePrecise(viewEnd)}</span>
        </div>
      </div>
    );
  },
);
