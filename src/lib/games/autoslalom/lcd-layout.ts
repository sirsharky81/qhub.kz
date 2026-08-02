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

/**
 * Рядовые позиции были размечены непосредственно по эталонному экрану.
 * Это не математическая перспектива: настоящий ЖК состоит из заранее
 * вытравленных сегментов, поэтому координаты намеренно фиксированы.
 */
const ROW_SLOTS = [
  { y: 65, x: [226, 262, 297], width: 13, height: 2.5 },
  { y: 79, x: [204, 244, 282], width: 15, height: 3 },
  { y: 96, x: [182, 227, 270], width: 18, height: 3.5 },
  { y: 116, x: [155, 207, 255], width: 22, height: 4 },
  { y: 139, x: [128, 187, 242], width: 26, height: 4.5 },
  { y: 164, x: [102, 166, 225], width: 30, height: 5 },
  { y: 190, x: [77, 145, 208], width: 35, height: 5.5 },
  { y: 212, x: [58, 124, 190], width: 39, height: 6 },
] as const;

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
  const slot = ROW_SLOTS[row] ?? ROW_SLOTS[0];
  return {
    id: `b-${row}-${lane}`,
    row,
    lane,
    x: slot.x[lane],
    y: slot.y,
    w: slot.width,
    h: slot.height,
    angle: -9,
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
  const positions = [
    { x: 62, y: 218, scale: 0.9 },
    { x: 128, y: 211, scale: 0.82 },
    { x: 194, y: 204, scale: 0.74 },
  ] as const;
  const position = positions[lane];
  return {
    id: `car-${lane}`,
    lane,
    x: position.x,
    y: position.y,
    angle: -9,
    scale: position.scale,
  };
}

export function allCarSlots(): CarSlot[] {
  return ([0, 1, 2] as Lane[]).map(carSlot);
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

/** Статические красные границы и дорожный баннер, снятые с эталонного кадра. */
export const RED_TRACK_LINES = [
  { x1: 2, y1: 133, x2: 242, y2: 3 },
  { x1: 2, y1: 201, x2: 270, y2: 2 },
  { x1: 292, y1: 196, x2: 326, y2: 4 },
] as const;

export { CAR_ROW, LCD_ROW_COUNT };
