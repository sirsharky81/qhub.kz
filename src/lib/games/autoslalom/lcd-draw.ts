import { CAR_Y, LCD } from "./constants";
import type { AutoslalomMode, AutoslalomState } from "./types";
import { formatClockDisplay } from "./engine";
import { laneBounds, laneCenterX, screenY } from "./lcd-geometry";

const HORIZON = 0.14;
const BASE = 0.94;

function segPattern(ch: string): number[] {
  const map: Record<string, number[]> = {
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
  return map[ch] ?? map[" "];
}

function drawSevenSegment(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ch: string,
): void {
  const seg = segPattern(ch);
  const sw = Math.max(1.5, w * 0.11);
  const g = w * 0.05;
  ctx.strokeStyle = LCD.segment;
  ctx.lineWidth = sw;
  ctx.lineCap = "butt";
  const hw = w - g * 2;
  const hh = (h - g * 3) / 2;
  const lines: [number, number, number, number][] = [
    [x + g, y + g, x + g + hw, y + g],
    [x + g, y + g, x + g, y + g + hh],
    [x + g + hw, y + g, x + g + hw, y + g + hh],
    [x + g, y + g + hh, x + g + hw, y + g + hh],
    [x + g, y + g + hh + g, x + g, y + g + hh + g + hh],
    [x + g + hw, y + g + hh + g, x + g + hw, y + g + hh + g + hh],
    [x + g, y + g + hh + g + hh, x + g + hw, y + g + hh + g + hh],
  ];
  lines.forEach(([x1, y1, x2, y2], i) => {
    if (!seg[i]) return;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });
}

function drawDigits(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dw: number, dh: number) {
  let cx = x;
  for (const ch of text) {
    if (ch === " ") {
      cx += dw * 0.45;
      continue;
    }
    drawSevenSegment(ctx, cx, y, dw, dh, ch);
    cx += dw + dw * 0.12;
  }
}

function drawCheckeredFlag(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cell = size / 4;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      ctx.fillStyle = (r + c) % 2 ? LCD.segment : LCD.bg;
      ctx.fillRect(x + c * cell, y + r * cell, cell, cell);
    }
  }
}

function drawStaticTrack(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sy = (d: number) => (HORIZON + d * (BASE - HORIZON)) * h;
  const half = (d: number) => ((0.34 + 0.54 * d) * w) / 2;

  // Outer red borders
  ctx.strokeStyle = LCD.track;
  ctx.lineWidth = Math.max(2, w * 0.014);
  ctx.lineCap = "square";
  for (const edge of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + edge * half(1), sy(1));
    ctx.lineTo(w / 2 + edge * half(0), sy(0));
    ctx.stroke();
  }

  // Lane divider dashes
  ctx.fillStyle = LCD.segment;
  for (let d = 0.08; d < 0.95; d += 0.055) {
    const y = sy(d);
    const hw = half(d);
    const laneW = (hw * 2) / 3;
    const dashW = laneW * 0.22;
    const cx = w / 2;
    for (const laneEdge of [-1, 1]) {
      const x = cx + laneEdge * laneW / 2 - dashW / 2;
      ctx.fillRect(x, y - 1, dashW, Math.max(1.5, h * 0.006));
    }
  }

  // Top banner
  const bannerY = sy(0.02);
  ctx.fillStyle = LCD.segment;
  ctx.font = `bold ${Math.max(7, w * 0.038)}px "Arial Narrow", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("РАЛЛИ", w * 0.28, bannerY);
  ctx.fillText("РАЛЛИ", w * 0.72, bannerY);
  drawCheckeredFlag(ctx, w / 2 - w * 0.04, bannerY - w * 0.035, w * 0.08);

  // Side flag
  drawCheckeredFlag(ctx, w * 0.78, sy(0.42), w * 0.055);

  // Left vertical RALLY text
  ctx.save();
  ctx.translate(w * 0.07, sy(0.5));
  ctx.rotate(-Math.PI / 2);
  ctx.font = `bold ${Math.max(6, w * 0.028)}px sans-serif`;
  for (let i = 0; i < 5; i++) ctx.fillText("РАЛЛИ", 0, i * w * 0.065);
  ctx.restore();
}

function drawMiniCar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, filled: boolean) {
  ctx.fillStyle = filled ? LCD.segment : "transparent";
  ctx.strokeStyle = LCD.segment;
  ctx.lineWidth = 1;
  const w = size;
  const hh = size * 0.55;
  ctx.beginPath();
  ctx.rect(x, y, w, hh);
  if (filled) ctx.fill();
  ctx.stroke();
  ctx.fillRect(x + w * 0.15, y - hh * 0.35, w * 0.7, hh * 0.45);
}

function drawLives(ctx: CanvasRenderingContext2D, lives: number, max: number, w: number, h: number) {
  const size = Math.max(5, w * 0.028);
  let x = w * 0.56;
  const y = h * 0.055;
  for (let i = 0; i < max; i++) {
    drawMiniCar(ctx, x, y, size, i < lives);
    x += size + 3;
  }
}

function drawSportCar(ctx: CanvasRenderingContext2D, w: number, h: number, lane: 0 | 1 | 2, blink: boolean) {
  if (blink) return;
  const depth = CAR_Y;
  const cx = laneCenterX(lane, depth, w);
  const cy = screenY(depth, h);
  const b = laneBounds(depth, w);
  const laneW = (b.right - b.left) / 3;
  const carW = laneW * 0.72;
  const carH = h * 0.055;

  ctx.fillStyle = LCD.segment;
  // Body
  ctx.fillRect(cx - carW / 2, cy - carH * 0.35, carW, carH * 0.55);
  // Cockpit / nose
  ctx.fillRect(cx - carW * 0.28, cy - carH * 0.75, carW * 0.56, carH * 0.42);
  // Wheels
  ctx.fillRect(cx - carW * 0.42, cy - carH * 0.1, carW * 0.18, carH * 0.22);
  ctx.fillRect(cx + carW * 0.24, cy - carH * 0.1, carW * 0.18, carH * 0.22);
  // SPORT label
  ctx.font = `bold ${Math.max(4, carW * 0.14)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SPORT", cx, cy - carH * 0.05);
}

function drawBarriers(ctx: CanvasRenderingContext2D, state: AutoslalomState, w: number, h: number) {
  for (const barrier of state.barriers) {
    const depth = HORIZON + barrier.y * (BASE - HORIZON);
    const y = screenY(barrier.y, h);
    const b = laneBounds(barrier.y, w);
    const laneW = (b.right - b.left) / 3;
    const barH = Math.max(2, h * (0.012 + barrier.y * 0.018));
    for (const lane of barrier.lanes) {
      const x = b.left + lane * laneW + laneW * 0.05;
      const bw = laneW * 0.9;
      ctx.fillStyle = LCD.segment;
      ctx.fillRect(x, y - barH / 2, bw, barH);
    }
  }
}

function drawModeBadge(ctx: CanvasRenderingContext2D, mode: AutoslalomMode, w: number, h: number) {
  const bx = w * 0.84;
  const by = h * 0.88;
  const r = w * 0.045;
  ctx.strokeStyle = LCD.segment;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = LCD.segment;
  ctx.font = `bold ${Math.max(8, w * 0.042)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(mode, bx, by + 0.5);
}

export interface LcdDrawParams {
  state: AutoslalomState;
  highScore: number;
  alarmRinging: boolean;
  now: Date;
  width: number;
  height: number;
}

export function drawLcd(ctx: CanvasRenderingContext2D, params: LcdDrawParams): void {
  const { state, highScore, alarmRinging, now, width: w, height: h } = params;

  ctx.fillStyle = alarmRinging && Math.floor(Date.now() / 500) % 2 ? LCD.bgDark : LCD.bg;
  ctx.fillRect(0, 0, w, h);

  drawStaticTrack(ctx, w, h);

  if (state.phase === "clock") {
    const hours = state.clockEdit === "none" ? now.getHours() : state.clock.hours;
    const minutes = state.clockEdit === "none" ? now.getMinutes() : state.clock.minutes;
    const text = formatClockDisplay(hours, minutes);
    const clockText = `${text.slice(0, 2)} ${text.slice(2)}`;
    drawDigits(ctx, clockText, w * 0.06, h * 0.035, w * 0.065, h * 0.1);
    if (state.clock.alarmEnabled) drawCheckeredFlag(ctx, w * 0.72, h * 0.04, w * 0.06);
    return;
  }

  const scoreVal = state.showHighScore ? highScore : state.score;
  const scoreStr = String(Math.min(9999, Math.max(0, scoreVal)));
  const scoreText = scoreStr.length <= 3 ? ` ${scoreStr.padStart(3, " ")}` : scoreStr.padStart(4, " ");
  drawDigits(ctx, scoreText, w * 0.06, h * 0.035, w * 0.065, h * 0.1);
  drawLives(ctx, state.lives, state.maxLives, w, h);

  if (state.phase === "playing" || state.phase === "crash") {
    const blink = state.phase === "crash" && Math.floor(Date.now() / 120) % 2 === 0;
    drawBarriers(ctx, state, w, h);
    drawSportCar(ctx, w, h, state.carLane, blink);
  } else {
    drawSportCar(ctx, w, h, 1, false);
  }

  drawModeBadge(ctx, state.mode, w, h);
}
