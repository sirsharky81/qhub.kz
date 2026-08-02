"use client";

import { useEffect, useRef } from "react";
import type { AutoslalomState } from "@/lib/games/autoslalom/types";
import { drawLcd } from "@/lib/games/autoslalom/lcd-draw";

interface LcdDisplayProps {
  state: AutoslalomState;
  highScore: number;
  alarmRinging: boolean;
  now: Date;
}

export function LcdDisplay({ state, highScore, alarmRinging, now }: LcdDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawLcd(ctx, {
        state,
        highScore,
        alarmRinging,
        now,
        width: rect.width,
        height: rect.height,
      });
    };

    render();
    const animate = state.phase === "playing" || state.phase === "crash" || alarmRinging;
    if (animate) {
      const loop = () => {
        render();
        animRef.current = requestAnimationFrame(loop);
      };
      animRef.current = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [state, highScore, alarmRinging, now]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full touch-none"
      aria-label="ЖК-экран Автослалом"
    />
  );
}
