/**
 * Каноническая геометрия ЖК Электроника ИМ-23 «Автослалом».
 * ViewBox 336×256 — все сегменты привязаны к фиксированным координатам.
 */

import type { Lane } from "./types";
import { CAR_ROW, LCD_ROW_COUNT } from "./constants";

export const LCD_VIEW = { w: 336, h: 256 } as const;

export const LCD_COLORS = {
  bg: "#b8c8a8",
  bgDark: "#9fb08a",
  segment: "#141414",
  track: "#d42030",
} as const;

/** Горизонт (верхний правый сектор). */
const VANISH_L = { x: 96, y: 36 };
const VANISH_R = { x: 306, y: 20 };
/** Линия автомобиля (низ). */
const NEAR_L = { x: 8, y: 228 };
const NEAR_R = { x: 206, y: 220 };

export interface TrackPoint {
  x: number;
  y: number;
  angle: number;
  laneW: number;
  barH: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Точка на трассе: row 0 — горизонт, row CAR_ROW — авто; laneFrac 0..1 поперёк трассы. */
export function trackPoint(row: number, laneFrac: number): TrackPoint {
  const t = Math.max(0, Math.min(1, row / CAR_ROW));
  const lx = lerp(VANISH_L.x, NEAR_L.x, t);
  const ly = lerp(VANISH_L.y, NEAR_L.y, t);
  const rx = lerp(VANISH_R.x, NEAR_R.x, t);
  const ry = lerp(VANISH_R.y, NEAR_R.y, t);
  const x = lerp(lx, rx, laneFrac);
  const y = lerp(ly, ry, laneFrac);
  const angle = (Math.atan2(ry - ly, rx - lx) * 180) / Math.PI;
  const laneW = (Math.hypot(rx - lx, ry - ly) / 3) * 0.84;
  const barH = 2.8 + t * 5.5;
  return { x, y, angle, laneW, barH };
}

export interface BarrierSlot {
  id: string;
  row: number;
  lane: Lane;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
}

export function barrierSlot(row: number, lane: Lane): BarrierSlot {
  const frac = (lane * 2 + 1) / 6;
  const p = trackPoint(row, frac);
  return {
    id: `b-${row}-${lane}`,
    row,
    lane,
    x: p.x,
    y: p.y,
    w: p.laneW,
    h: p.barH,
    angle: p.angle,
  };
}

export function allBarrierSlots(): BarrierSlot[] {
  const slots: BarrierSlot[] = [];
  for (let row = 0; row < LCD_ROW_COUNT; row++) {
    for (let lane = 0; lane < 3; lane++) {
      slots.push(barrierSlot(row, lane as Lane));
    }
  }
  return slots;
}

export interface CarSlot {
  id: string;
  lane: Lane;
  x: number;
  y: number;
  angle: number;
  scale: number;
}

export function carSlot(lane: Lane): CarSlot {
  const p = trackPoint(CAR_ROW, (lane * 2 + 1) / 6);
  return {
    id: `car-${lane}`,
    lane,
    x: p.x,
    y: p.y,
    angle: p.angle,
    scale: 0.78 + lane * 0.04,
  };
}

export function allCarSlots(): CarSlot[] {
  return ([0, 1, 2] as Lane[]).map(carSlot);
}

/** Пунктирные делители полос (статичные сегменты ЖК). */
export function laneDashSlots(): { x: number; y: number; w: number; angle: number }[] {
  const dashes: { x: number; y: number; w: number; angle: number }[] = [];
  for (let row = 1; row < CAR_ROW; row++) {
    for (const frac of [1 / 3, 2 / 3]) {
      const p = trackPoint(row, frac);
      dashes.push({ x: p.x, y: p.y, w: p.laneW * 0.38, angle: p.angle });
    }
  }
  return dashes;
}

/** Координаты семисегментных цифр (4 позиции + пробел). */
export const SCORE_DIGITS = [
  { x: 10, y: 10, w: 20, h: 28 },
  { x: 36, y: 10, w: 20, h: 28 },
  { x: 68, y: 10, w: 20, h: 28 },
  { x: 94, y: 10, w: 20, h: 28 },
] as const;

/** Иконки жизней (мини-авто). */
export const LIFE_SLOTS = [
  { x: 168, y: 14, w: 14, h: 8 },
  { x: 186, y: 14, w: 14, h: 8 },
  { x: 204, y: 14, w: 14, h: 8 },
  { x: 222, y: 14, w: 14, h: 8 },
  { x: 240, y: 14, w: 14, h: 8 },
  { x: 258, y: 14, w: 14, h: 8 },
] as const;

export const MODE_BADGE = { x: 288, y: 214, size: 22 } as const;
export const FLAG_BR = { x: 262, y: 210, size: 16 } as const;
export const FLAG_TOP = { x: 248, y: 28, size: 18 } as const;

export function barrierId(row: number, lane: Lane): string {
  return `b-${row}-${lane}`;
}

export { CAR_ROW, LCD_ROW_COUNT, NEAR_L, NEAR_R, VANISH_L, VANISH_R };
