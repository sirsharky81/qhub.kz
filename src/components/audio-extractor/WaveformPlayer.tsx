"use client";

import { useCallback, useEffect, useRef } from "react";
import { clampTime } from "@/lib/music-editor/format";

interface WaveformPlayerProps {
  peaks: number[];
  duration: number;
  currentTime: number;
  isPlaying?: boolean;
  onSeek: (time: number) => void;
  getPlayheadTime?: () => number;
  height?: number;
}

export function WaveformPlayer({
  peaks,
  duration,
  currentTime,
  isPlaying = false,
  onSeek,
  getPlayheadTime,
  height = 120,
}: WaveformPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const resolvePlayheadTime = useCallback(() => {
    return getPlayheadTime?.() ?? currentTime;
  }, [getPlayheadTime, currentTime]);

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
    const barWidth = width / peaks.length;
    const playhead = resolvePlayheadTime();
    const playheadX = (playhead / duration) * width;

    ctx.fillStyle = "rgba(229, 231, 235, 0.6)";
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < peaks.length; i++) {
      const x = i * barWidth;
      const barH = peaks[i] * (height * 0.85);
      const t = (i / peaks.length) * duration;
      ctx.fillStyle = t <= playhead ? "#374151" : "#9ca3af";
      ctx.fillRect(x, mid - barH / 2, Math.max(1, barWidth - 0.5), barH);
    }

    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.arc(playheadX, mid, isPlaying ? 6 : 5, 0, Math.PI * 2);
    ctx.fill();
  }, [peaks, duration, height, isPlaying, resolvePlayheadTime]);

  useEffect(() => {
    draw();
  }, [draw]);

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

  const handlePointer = (clientX: number) => {
    const container = containerRef.current;
    if (!container || duration <= 0) return;
    const rect = container.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    onSeek(clampTime(ratio * duration, duration));
  };

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl border border-gray-200 bg-white overflow-hidden cursor-pointer touch-none"
      onClick={(e) => handlePointer(e.clientX)}
      onTouchEnd={(e) => {
        const touch = e.changedTouches[0];
        if (touch) handlePointer(touch.clientX);
      }}
      role="slider"
      aria-label="Waveform"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={currentTime}
    >
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}
