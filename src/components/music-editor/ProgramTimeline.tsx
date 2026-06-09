"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimePrecise } from "@/lib/music-editor/format";
import { effectiveTrimEnd } from "@/lib/music-editor/selection";
import type { ManualEditSettings, ProgramTimeline as ProgramTimelineData } from "@/lib/music-editor/types";
import { PROGRAM_SEGMENT_COLORS } from "@/lib/music-editor/types";

interface SegmentPeaks {
  trackId: string;
  peaks: number[];
}

interface ProgramTimelineProps {
  timeline: ProgramTimelineData;
  segmentPeaks: SegmentPeaks[];
  currentTime: number;
  isPlaying?: boolean;
  getPlayheadTime?: () => number;
  onSeek: (time: number) => void;
  trimStart?: number;
  trimEnd?: number | null;
  duration?: number;
  height?: number;
}

export function ProgramTimeline({
  timeline,
  segmentPeaks,
  currentTime,
  isPlaying = false,
  getPlayheadTime,
  onSeek,
  trimStart = 0,
  trimEnd = null,
  duration: durationProp,
  height = 108,
}: ProgramTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  const [dragPlayheadTime, setDragPlayheadTime] = useState<number | null>(null);

  const { segments, transitions, totalDuration } = timeline;
  const duration = durationProp ?? totalDuration;
  const effTrimEnd = trimEnd ?? duration;

  const resolvePlayheadTime = useCallback(() => {
    if (dragPlayheadTime !== null) return dragPlayheadTime;
    return getPlayheadTime?.() ?? currentTime;
  }, [dragPlayheadTime, getPlayheadTime, currentTime]);

  const timeToX = useCallback(
    (time: number, width: number) => {
      if (duration <= 0) return 0;
      return (time / duration) * width;
    },
    [duration],
  );

  const xToTime = useCallback(
    (x: number, width: number) => {
      if (duration <= 0) return 0;
      return Math.max(0, Math.min((x / width) * duration, duration));
    },
    [duration],
  );

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
    const pad = 4;

    const drawRegion = (start: number, end: number, fill: string) => {
      const x1 = timeToX(start, width);
      const x2 = timeToX(end, width);
      if (x2 > x1) {
        ctx.fillStyle = fill;
        ctx.fillRect(x1, pad, x2 - x1, height - pad * 2);
      }
    };

    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(0, pad, width, height - pad * 2);

    if (trimStart > 0) drawRegion(0, trimStart, "rgba(254, 226, 226, 0.75)");
    if (effTrimEnd < duration) drawRegion(effTrimEnd, duration, "rgba(254, 226, 226, 0.75)");
    drawRegion(trimStart, effTrimEnd, "rgba(16, 185, 129, 0.08)");

    for (const seg of segments) {
      const x1 = timeToX(seg.programStart, width);
      const x2 = timeToX(seg.programEnd, width);
      const segWidth = x2 - x1;
      if (segWidth <= 1) continue;

      const color = PROGRAM_SEGMENT_COLORS[seg.colorIndex % PROGRAM_SEGMENT_COLORS.length];

      const grad = ctx.createLinearGradient(x1, 0, x2, 0);
      grad.addColorStop(0, color.bg);
      grad.addColorStop(1, color.bg.replace("0.15", "0.22"));
      ctx.fillStyle = grad;
      ctx.fillRect(x1, pad, segWidth, height - pad * 2);

      const peaksEntry = segmentPeaks.find((p) => p.trackId === seg.trackId);
      const peaks = peaksEntry?.peaks ?? [];
      if (peaks.length > 0) {
        const barWidth = segWidth / peaks.length;
        const maxBarH = (height - pad * 2) * 0.44;
        for (let i = 0; i < peaks.length; i++) {
          const amp = Math.min(1, peaks[i]);
          const barH = Math.max(1.5, amp * maxBarH);
          const bx = x1 + i * barWidth + 0.5;
          const bw = Math.max(1, barWidth - 1.5);
          const radius = Math.min(2, bw / 2);

          const barGrad = ctx.createLinearGradient(0, mid - barH, 0, mid + barH);
          barGrad.addColorStop(0, color.wave);
          barGrad.addColorStop(0.5, color.label);
          barGrad.addColorStop(1, color.wave);

          ctx.fillStyle = barGrad;
          ctx.globalAlpha = 0.88;
          ctx.beginPath();
          ctx.roundRect(bx, mid - barH, bw, barH, radius);
          ctx.fill();
          ctx.beginPath();
          ctx.roundRect(bx, mid, bw, barH, radius);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      ctx.strokeStyle = color.wave;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5;
      ctx.strokeRect(x1 + 0.5, pad + 0.5, segWidth - 1, height - pad * 2 - 1);
      ctx.globalAlpha = 1;

      const label = seg.trackName.length > 22 ? `${seg.trackName.slice(0, 20)}…` : seg.trackName;
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      const tw = ctx.measureText(label).width;
      if (tw + 16 < segWidth) {
        ctx.fillRect(x1 + 4, pad + 4, tw + 8, 14);
        ctx.fillStyle = color.label;
        ctx.fillText(label, x1 + 8, pad + 14);
      }

      ctx.font = "700 9px system-ui, sans-serif";
      ctx.fillStyle = color.wave;
      ctx.globalAlpha = 0.7;
      ctx.fillText(`${seg.colorIndex + 1}`, x1 + segWidth - 14, pad + 14);
      ctx.globalAlpha = 1;
    }

    for (const t of transitions) {
      const x1 = timeToX(t.programStart, width);
      const x2 = timeToX(t.programEnd, width);
      const tw = x2 - x1;
      if (tw <= 0) continue;

      const grad = ctx.createLinearGradient(x1, 0, x2, 0);
      grad.addColorStop(0, "rgba(147, 51, 234, 0.08)");
      grad.addColorStop(0.5, "rgba(147, 51, 234, 0.35)");
      grad.addColorStop(1, "rgba(147, 51, 234, 0.08)");
      ctx.fillStyle = grad;
      ctx.fillRect(x1, pad, tw, height - pad * 2);

      ctx.strokeStyle = "rgba(124, 58, 237, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(x1, pad);
      ctx.lineTo(x2, height - pad);
      ctx.stroke();
      ctx.setLineDash([]);

      if (tw > 36) {
        ctx.fillStyle = "#6d28d9";
        ctx.font = "9px system-ui, sans-serif";
        ctx.fillText(`↔ ${t.duration}с`, x1 + 3, height - pad - 2);
      }
    }

    for (const seg of segments) {
      const px = timeToX(seg.programStart, width);
      if (px > 1) {
        ctx.strokeStyle = "rgba(107, 114, 128, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, pad);
        ctx.lineTo(px, height - pad);
        ctx.stroke();
      }
    }

    const drawMarker = (time: number, color: string) => {
      const px = timeToX(time, width);
      if (px < -4 || px > width + 4) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, pad);
      ctx.lineTo(px, height - pad);
      ctx.stroke();
    };

    drawMarker(trimStart, "#059669");
    drawMarker(effTrimEnd, "#dc2626");

    const playTime = resolvePlayheadTime();
    const playX = timeToX(playTime, width);
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, pad);
    ctx.lineTo(playX, height - pad);
    ctx.stroke();
    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.arc(playX, mid, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = "#9ca3af";
    ctx.font = "9px monospace";
    ctx.fillText(formatTimePrecise(0), 4, height - 2);
    const endLabel = formatTimePrecise(duration);
    ctx.fillText(endLabel, width - ctx.measureText(endLabel).width - 4, height - 2);
  }, [
    segments,
    transitions,
    duration,
    segmentPeaks,
    height,
    timeToX,
    resolvePlayheadTime,
    trimStart,
    effTrimEnd,
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

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container || duration <= 0) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = xToTime(x, rect.width);
    dragRef.current = true;
    setDragPlayheadTime(time);
    onSeek(time);
    container.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = xToTime(x, rect.width);
    setDragPlayheadTime(time);
    onSeek(time);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
    dragRef.current = false;
    setDragPlayheadTime(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white overflow-hidden cursor-crosshair touch-none shadow-inner"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={(e) => e.stopPropagation()}
    >
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}
