/** Perspective helpers for ИМ-23 LCD (y: 0 horizon → 1 bottom). */

export interface TrackPoint {
  x: number;
  y: number;
}

export interface TrackLane {
  left: number;
  center: number;
  right: number;
  y: number;
}

const HORIZON_Y = 0.14;
const BASE_Y = 0.94;
const TOP_WIDTH = 0.34;
const BOTTOM_WIDTH = 0.88;

export function trackY(screenY: number, height: number): number {
  return (screenY / height - HORIZON_Y) / (BASE_Y - HORIZON_Y);
}

export function screenY(depth: number, height: number): number {
  return (HORIZON_Y + depth * (BASE_Y - HORIZON_Y)) * height;
}

export function laneBounds(depth: number, width: number): TrackLane {
  const t = Math.max(0, Math.min(1, depth));
  const trackW = (TOP_WIDTH + (BOTTOM_WIDTH - TOP_WIDTH) * t) * width;
  const cx = width / 2;
  const laneW = trackW / 3;
  return {
    left: cx - trackW / 2,
    center: cx - laneW / 2,
    right: cx + laneW / 2,
    y: screenY(t, 1),
  };
}

export function laneCenterX(lane: 0 | 1 | 2, depth: number, width: number): number {
  const b = laneBounds(depth, width);
  const laneW = (b.right - b.left) / 3;
  return b.left + laneW * (lane + 0.5);
}

export function laneRect(lane: 0 | 1 | 2, depth: number, width: number, barHeight: number) {
  const b = laneBounds(depth, width);
  const laneW = (b.right - b.left) / 3;
  const x = b.left + lane * laneW + laneW * 0.06;
  const w = laneW * 0.88;
  const y = screenY(depth, 1) * (width / (width / 1.05)); // normalized
  return { x, y, w, h: barHeight, laneW };
}
