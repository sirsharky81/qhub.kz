"use client";

import { useEffect, useRef } from "react";
import { CAR_Y, LCD } from "@/lib/games/autoslalom/constants";
import type { AutoslalomMode, AutoslalomPhase, AutoslalomState } from "@/lib/games/autoslalom/types";
import { formatClockDisplay, formatScoreDisplay } from "@/lib/games/autoslalom/engine";

interface LcdDisplayProps {
  state: AutoslalomState;
  highScore: number;
  alarmRinging: boolean;
  now: Date;
}

function drawSevenSegment(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  char: string,
): void {
  const segments: Record<string, number[]> = {
    "0": [1, 1, 1, 0, 1, 1, 1],
    "1": [0, 0, 1, 0, 0, 1, 0],
    "2": [1, 0, 1, 1, 1, 0, 1],
    "3": [1, 0, 1, 1, 0, 1, 1],
    "4": [0, 1, 1, 1, 0, 1, 0],
    "5": [1, 1, 0, 1, 0, 1, 1],
    "6": [1, 1, 0, 1, 1, 1, 1],
    "7": [1, 0, 1, 0, 0, 1, 0],
    "8": [1, 1, 1, 1, 1, 1, 1],
    "9": [1, 1, 1, 1, 0, 1, 1],
    " ": [0, 0, 0, 0, 0, 0, 0],
  };
  const seg = segments[char] ?? segments[" "];
  const sw = w * 0.12;
  const gap = w * 0.04;
  ctx.fillStyle = LCD.segment;
  ctx.strokeStyle = LCD.segment;
  ctx.lineWidth = sw;
  ctx.lineCap = "butt";

  const drawSeg = (on: number, x1: number, y1: number, x2: number, y2: number) => {
    if (!on) return;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const hw = w - gap * 2;
  const hh = (h - gap * 3) / 2;
  drawSeg(seg[0], x + gap, y + gap, x + gap + hw, y + gap);
  drawSeg(seg[1], x + gap, y + gap, x + gap, y + gap + hh);
  drawSeg(seg[2], x + gap + hw, y + gap, x + gap + hw, y + gap + hh);
  drawSeg(seg[3], x + gap, y + gap + hh, x + gap + hw, y + gap + hh);
  drawSeg(seg[4], x + gap, y + gap + hh + gap, x + gap, y + gap + hh + gap + hh);
  drawSeg(seg[5], x + gap + hw, y + gap + hh + gap, x + gap + hw, y + gap + hh + gap + hh);
  drawSeg(seg[6], x + gap, y + gap + hh + gap + hh, x + gap + hw, y + gap + hh + gap + hh);
}

function drawDisplayValue(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  digitW: number,
  digitH: number,
): void {
  for (let i = 0; i < text.length; i++) {
    drawSevenSegment(ctx, x + i * (digitW + 2), y, digitW, digitH, text[i] ?? " ");
  }
}

function laneX(width: number, lane: number): number {
  const margin = width * 0.18;
  const trackW = width - margin * 2;
  return margin + (lane + 0.5) * (trackW / 3);
}

function drawTrack(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const marginX = w * 0.18;
  const topY = h * 0.18;
  const bottomY = h * 0.92;
  const topHalf = ((w - marginX * 2) / 2) * 0.55;
  const bottomHalf = (w - marginX * 2) / 2;

  ctx.strokeStyle = LCD.track;
  ctx.lineWidth = Math.max(2, w * 0.012);
  ctx.lineCap = "square";

  for (let i = -1; i <= 1; i++) {
    const bx = w / 2 + i * bottomHalf;
    const tx = w / 2 + i * topHalf;
    ctx.beginPath();
    ctx.moveTo(bx, bottomY);
    ctx.lineTo(tx, topY);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(marginX * 0.35, h * 0.42);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = LCD.track;
  ctx.font = `bold ${Math.max(8, w * 0.045)}px sans-serif`;
  ctx.textAlign = "center";
  for (let i = 0; i < 4; i++) {
    ctx.fillText("РАЛЛИ", 0, i * w * 0.11);
  }
  ctx.restore();
}

function drawCar(ctx: CanvasRenderingContext2D, w: number, h: number, lane: number, blink: boolean): void {
  if (blink) return;
  const x = laneX(w, lane);
  const y = h * CAR_Y;
  const carW = w * 0.11;
  const carH = h * 0.055;
  ctx.fillStyle = LCD.segment;
  ctx.fillRect(x - carW / 2, y - carH / 2, carW, carH);
  ctx.fillRect(x - carW * 0.35, y - carH * 0.85, carW * 0.7, carH * 0.45);
}

function drawBarriers(ctx: CanvasRenderingContext2D, state: AutoslalomState, w: number, h: number): void {
  const marginX = w * 0.18;
  const trackW = w - marginX * 2;
  const laneW = trackW / 3;
  const barH = h * 0.028;

  for (const barrier of state.barriers) {
    const y = h * (0.18 + barrier.y * 0.74);
    for (const lane of barrier.lanes) {
      const x = marginX + lane * laneW + laneW * 0.08;
      const bw = laneW * 0.84;
      ctx.fillStyle = LCD.segment;
      ctx.fillRect(x, y - barH / 2, bw, barH);
    }
  }
}

function drawLives(ctx: CanvasRenderingContext2D, lives: number, maxLives: number, w: number, h: number): void {
  const size = Math.max(6, w * 0.035);
  const startX = w * 0.72;
  const y = h * 0.08;
  for (let i = 0; i < maxLives; i++) {
    ctx.fillStyle = i < lives ? LCD.segment : LCD.bgDark;
    ctx.strokeStyle = LCD.segment;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(startX + i * (size + 3), y, size, size * 0.6);
    if (i < lives) ctx.fill();
    else ctx.stroke();
  }
}

function drawModeBadge(ctx: CanvasRenderingContext2D, mode: AutoslalomMode, phase: AutoslalomPhase, w: number, h: number): void {
  if (phase === "clock") return;
  const x = w * 0.82;
  const y = h * 0.9;
  ctx.strokeStyle = LCD.segment;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w * 0.1, h * 0.06);
  ctx.fillStyle = LCD.segment;
  ctx.font = `bold ${Math.max(10, w * 0.05)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(mode, x + w * 0.05, y + h * 0.03);
}

export function LcdDisplay({ state, highScore, alarmRinging, now }: LcdDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = rect.width;
      const h = rect.height;

      ctx.fillStyle = alarmRinging && Math.floor(Date.now() / 500) % 2 ? LCD.bgDark : LCD.bg;
      ctx.fillRect(0, 0, w, h);

      drawTrack(ctx, w, h);

      if (state.phase === "clock") {
        const hours = state.clockEdit === "none" ? now.getHours() : state.clock.hours;
        const minutes = state.clockEdit === "none" ? now.getMinutes() : state.clock.minutes;
        drawDisplayValue(ctx, formatClockDisplay(hours, minutes), w * 0.08, h * 0.04, w * 0.07, h * 0.09);
        if (state.clock.alarmEnabled) {
          ctx.fillStyle = LCD.segment;
          ctx.font = `${Math.max(8, w * 0.035)}px sans-serif`;
          ctx.fillText("⏰", w * 0.72, h * 0.1);
        }
      } else {
        const displayScore = state.showHighScore ? highScore : state.score;
        drawDisplayValue(ctx, formatScoreDisplay(displayScore), w * 0.08, h * 0.04, w * 0.07, h * 0.09);
        drawLives(ctx, state.lives, state.maxLives, w, h);
        if (state.phase === "playing" || state.phase === "crash") {
          const blink = state.phase === "crash" && Math.floor(Date.now() / 120) % 2 === 0;
          drawBarriers(ctx, state, w, h);
          drawCar(ctx, w, h, state.carLane, blink);
        } else if (state.phase === "idle" || state.phase === "gameover") {
          drawCar(ctx, w, h, 1, false);
        }
        drawModeBadge(ctx, state.mode, state.phase, w, h);
      }
    };

    draw();

    const animate = state.phase === "playing" || state.phase === "crash" || alarmRinging;
    if (animate) {
      const loop = () => {
        draw();
        animRef.current = requestAnimationFrame(loop);
      };
      animRef.current = requestAnimationFrame(loop);
    }

    return () => cancelAnimationFrame(animRef.current);
  }, [state, highScore, alarmRinging, now]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full aspect-[1.05/1] touch-none"
      aria-label="Экран игры Автослалом"
    />
  );
}
