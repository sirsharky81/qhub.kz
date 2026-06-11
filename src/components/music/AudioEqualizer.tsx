"use client";

import { useEffect, useRef } from "react";

interface AudioEqualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  barCount?: number;
  className?: string;
}

export function AudioEqualizer({
  analyser,
  isPlaying,
  barCount = 16,
  className = "",
}: AudioEqualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const analyserRef = useRef(analyser);

  useEffect(() => {
    analyserRef.current = analyser;
  }, [analyser]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const freqData = new Uint8Array(128);
    const timeData = new Uint8Array(128);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const draw = () => {
      const { width, height } = container.getBoundingClientRect();
      const node = analyserRef.current;
      ctx.clearRect(0, 0, width, height);

      const gap = 1.5;
      const barW = (width - gap * (barCount - 1)) / barCount;

      if (node && isPlaying) {
        node.getByteFrequencyData(freqData);
        node.getByteTimeDomainData(timeData);
      }

      for (let i = 0; i < barCount; i++) {
        let value = 0.06;

        if (node && isPlaying) {
          const freqIdx = Math.floor(Math.pow(i / barCount, 1.6) * (freqData.length - 1));
          const freqVal = freqData[freqIdx] / 255;
          const timeIdx = Math.floor((i / barCount) * timeData.length);
          const timeVal = Math.abs(timeData[timeIdx] - 128) / 128;
          value = Math.max(freqVal, timeVal * 0.85);
        } else if (isPlaying) {
          value = 0.1 + Math.sin(Date.now() / 350 + i * 0.5) * 0.06;
        }

        const barH = Math.max(2, value * height * 0.92);
        const x = i * (barW + gap);
        const y = height - barH;

        const gradient = ctx.createLinearGradient(0, y, 0, height);
        gradient.addColorStop(0, isPlaying ? "#8b5cf6" : "#d1d5db");
        gradient.addColorStop(1, isPlaying ? "#6366f1" : "#e5e7eb");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 1);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [isPlaying, barCount]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <canvas ref={canvasRef} className="block w-full h-full" aria-hidden />
    </div>
  );
}
