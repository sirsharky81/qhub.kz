/**
 * Геометрия ЖК ИМ-23: перспектива сходится к верхнему правому углу.
 * Ряд 0 — горизонт, ряд CAR_ROW — линия автомобиля (низ-слева).
 */

import { CAR_ROW, LCD_ROW_COUNT } from "./constants";
import type { Lane } from "./types";

export interface Point {
  x: number;
  y: number;
}

export interface RowGeometry {
  row: number;
  /** t: 0 horizon → 1 car line */
  t: number;
  left: Point;
  right: Point;
  laneCenters: [Point, Point, Point];
  laneWidths: [number, number, number];
}

/** Точка схода — верхний правый угол экрана. */
function vanish(w: number, h: number): Point {
  return { x: w * 0.9, y: h * 0.1 };
}

/** Нижний край трассы (линия автомобиля). */
function nearLeft(w: number, h: number): Point {
  return { x: w * 0.05, y: h * 0.9 };
}

function nearRight(w: number, h: number): Point {
  return { x: w * 0.68, y: h * 0.82 };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function rowT(row: number): number {
  return Math.max(0, Math.min(1, row / CAR_ROW));
}

export function getRowGeometry(row: number, w: number, h: number): RowGeometry {
  const t = rowT(row);
  const v = vanish(w, h);
  const nl = nearLeft(w, h);
  const nr = nearRight(w, h);
  const left = lerpPoint(nl, v, t * 0.92);
  const right = lerpPoint(nr, v, t * 0.92);
  const laneCenters: [Point, Point, Point] = [
    lerpPoint(left, right, 1 / 6),
    lerpPoint(left, right, 3 / 6),
    lerpPoint(left, right, 5 / 6),
  ];
  const trackW = Math.hypot(right.x - left.x, right.y - left.y);
  const laneW = trackW / 3;
  return {
    row,
    t,
    left,
    right,
    laneCenters,
    laneWidths: [laneW * 0.82, laneW * 0.82, laneW * 0.82],
  };
}

export function laneCenter(row: number, lane: Lane, w: number, h: number): Point {
  return getRowGeometry(row, w, h).laneCenters[lane];
}

export function laneSegmentRect(row: number, lane: Lane, w: number, h: number) {
  const g = getRowGeometry(row, w, h);
  const c = g.laneCenters[lane];
  const lw = g.laneWidths[lane];
  const bh = Math.max(2, h * (0.014 + g.t * 0.022));
  const angle = Math.atan2(g.right.y - g.left.y, g.right.x - g.left.x);
  return { x: c.x, y: c.y, w: lw, h: bh, angle };
}

export function allRowIndices(): number[] {
  return Array.from({ length: LCD_ROW_COUNT + 1 }, (_, i) => i);
}

export { CAR_ROW, LCD_ROW_COUNT };
