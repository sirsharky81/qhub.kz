import type { AutoslalomMode, AutoslalomState } from "./types";
import { LCD } from "./constants";
import { formatClockDisplay } from "./engine";
import { CAR_ROW as CAR_ROW_GEO, getRowGeometry, laneCenter, laneSegmentRect } from "./lcd-geometry";
import type { Lane } from "./types";

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

function drawSevenSegment(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ch: string) {
  const seg = segPattern(ch);
  const sw = Math.max(1.5, w * 0.11);
  const g = w * 0.05;
  ctx.strokeStyle = LCD.segment;
  ctx.lineWidth = sw;
  const hw = w - g * 2;
  const hh = (h - g * 3) / 2;
  const lines: [number, number, number, number, number][] = [
    [seg[0], x + g, y + g, x + g + hw, y + g],
    [seg[1], x + g, y + g, x + g, y + g + hh],
    [seg[2], x + g + hw, y + g, x + g + hw, y + g + hh],
    [seg[3], x + g, y + g + hh, x + g + hw, y + g + hh],
    [seg[4], x + g, y + g + hh + g, x + g, y + g + hh + g + hh],
    [seg[5], x + g + hw, y + g + hh + g, x + g + hw, y + g + hh + g + hh],
    [seg[6], x + g, y + g + hh + g + hh, x + g + hw, y + g + hh + g + hh],
  ];
  for (const [on, x1, y1, x2, y2] of lines) {
    if (!on) continue;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

function drawDigits(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dw: number, dh: number) {
  let cx = x;
  for (const ch of text) {
    if (ch === " ") {
      cx += dw * 0.42;
      continue;
    }
    drawSevenSegment(ctx, cx, y, dw, dh, ch);
    cx += dw + dw * 0.1;
  }
}

function drawCheckeredFlag(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cell = size / 4;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      ctx.fillStyle = (r + c) % 2 ? LCD.segment : LCD.bg;
      ctx.fillRect(x + c * cell, y + r * cell, cell + 0.5, cell + 0.5);
    }
  }
}

/** Две красные границы + пунктир между полосами (статичная графика ЖК). */
function drawStaticTrack(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g0 = getRowGeometry(0, w, h);
  const g8 = getRowGeometry(CAR_ROW_GEO, w, h);

  ctx.strokeStyle = LCD.track;
  ctx.lineWidth = Math.max(2, w * 0.013);
  ctx.lineCap = "square";

  for (const edge of [
    [g8.left, g0.left],
    [g8.right, g0.right],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(edge[0].x, edge[0].y);
    ctx.lineTo(edge[1].x, edge[1].y);
    ctx.stroke();
  }

  // Пунктирные деления полос
  ctx.fillStyle = LCD.segment;
  for (let row = 1; row < CAR_ROW_GEO; row += 1) {
    const g = getRowGeometry(row, w, h);
    const angle = Math.atan2(g.right.y - g.left.y, g.right.x - g.left.x);
    for (const lane of [0, 1] as const) {
      const c1 = g.laneCenters[lane];
      const c2 = g.laneCenters[lane + 1];
      const mx = (c1.x + c2.x) / 2;
      const my = (c1.y + c2.y) / 2;
      const dashW = g.laneWidths[lane] * 0.35;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(angle);
      ctx.fillRect(-dashW / 2, -1, dashW, Math.max(1.5, h * 0.005));
      ctx.restore();
    }
  }

  // «РАЛЛИ» ×3 вдоль верхней красной границы
  ctx.fillStyle = LCD.segment;
  ctx.font = `bold ${Math.max(6, w * 0.032)}px "Arial Narrow", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 3; i++) {
    const t = 0.08 + i * 0.14;
    const px = g0.left.x + (g0.right.x - g0.left.x) * (0.15 + i * 0.32);
    const py = g0.left.y + (g0.right.y - g0.left.y) * (0.1 + i * 0.05) - h * 0.02;
    ctx.fillText("РАЛЛИ", px, py);
  }
  drawCheckeredFlag(ctx, g0.right.x - w * 0.11, g0.right.y - h * 0.01, w * 0.07);
}

function fillSegment(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawBarrierSegment(ctx: CanvasRenderingContext2D, row: number, lane: Lane, w: number, h: number) {
  const rect = laneSegmentRect(row, lane, w, h);
  ctx.fillStyle = LCD.segment;
  fillSegment(ctx, rect.x, rect.y, rect.w, rect.h, rect.angle);
}

function drawFormulaCar(ctx: CanvasRenderingContext2D, lane: Lane, w: number, h: number, blink: boolean) {
  if (blink) return;
  const c = laneCenter(CAR_ROW_GEO, lane, w, h);
  const g = getRowGeometry(CAR_ROW_GEO, w, h);
  const angle = Math.atan2(g.right.y - g.left.y, g.right.x - g.left.x);
  const lw = g.laneWidths[lane];

  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(angle);
  ctx.fillStyle = LCD.segment;

  // Корпус
  ctx.fillRect(-lw * 0.38, -lw * 0.1, lw * 0.76, lw * 0.18);
  // Нос
  ctx.fillRect(lw * 0.18, -lw * 0.14, lw * 0.22, lw * 0.1);
  // Кокpit / шлем
  ctx.beginPath();
  ctx.arc(-lw * 0.05, -lw * 0.08, lw * 0.07, 0, Math.PI * 2);
  ctx.fill();
  // Заднее крыло
  ctx.fillRect(-lw * 0.42, -lw * 0.22, lw * 0.12, lw * 0.04);
  ctx.fillRect(-lw * 0.42, lw * 0.06, lw * 0.12, lw * 0.04);

  // Колёса с «протектором»
  for (const wx of [-lw * 0.28, lw * 0.22]) {
    ctx.fillRect(wx, -lw * 0.02, lw * 0.14, lw * 0.12);
    ctx.clearRect(wx + 1, -lw * 0.005, lw * 0.12, 1.5);
    ctx.fillRect(wx + 1, lw * 0.04, lw * 0.12, 1.5);
  }

  ctx.font = `bold ${Math.max(3, lw * 0.11)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SPORT", 0, lw * 0.02);
  ctx.restore();
}

function drawLives(ctx: CanvasRenderingContext2D, lives: number, max: number, w: number, h: number) {
  const size = Math.max(4, w * 0.022);
  let x = w * 0.52;
  const y = h * 0.04;
  for (let i = 0; i < max; i++) {
    ctx.fillStyle = i < lives ? LCD.segment : "transparent";
    ctx.strokeStyle = LCD.segment;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, size * 1.4, size);
    if (i < lives) ctx.fillRect(x, y, size * 1.4, size);
    x += size * 1.6 + 2;
  }
}

function drawModeBadge(ctx: CanvasRenderingContext2D, mode: AutoslalomMode, w: number, h: number) {
  const g = getRowGeometry(CAR_ROW_GEO, w, h);
  const bx = g.right.x + w * 0.04;
  const by = g.right.y - h * 0.02;
  const s = w * 0.055;
  ctx.strokeStyle = LCD.segment;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, s, s);
  ctx.fillStyle = LCD.segment;
  ctx.font = `bold ${Math.max(7, s * 0.65)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(mode, bx + s / 2, by + s / 2);
  drawCheckeredFlag(ctx, bx - s * 0.85, by + s * 0.15, s * 0.7);
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
    drawDigits(ctx, `${text.slice(0, 2)} ${text.slice(2)}`, w * 0.04, h * 0.03, w * 0.06, h * 0.095);
    if (state.clock.alarmEnabled) drawCheckeredFlag(ctx, w * 0.55, h * 0.035, w * 0.055);
    return;
  }

  const scoreVal = state.showHighScore ? highScore : state.score;
  const scoreStr = String(Math.min(9999, Math.max(0, scoreVal)));
  const scoreText = scoreStr.length <= 3 ? ` ${scoreStr.padStart(3, " ")}` : scoreStr.padStart(4, " ");
  drawDigits(ctx, scoreText, w * 0.04, h * 0.03, w * 0.06, h * 0.095);
  drawLives(ctx, state.lives, state.maxLives, w, h);

  if (state.phase === "playing" || state.phase === "crash") {
    const blink = state.phase === "crash" && Math.floor(Date.now() / 120) % 2 === 0;
    for (const barrier of state.barriers) {
      if (barrier.row < 0 || barrier.row >= CAR_ROW_GEO) continue;
      for (const lane of barrier.lanes) {
        drawBarrierSegment(ctx, barrier.row, lane, w, h);
      }
    }
    drawFormulaCar(ctx, state.carLane, w, h, blink);
  } else {
    drawFormulaCar(ctx, 1, w, h, false);
  }

  drawModeBadge(ctx, state.mode, w, h);
}
