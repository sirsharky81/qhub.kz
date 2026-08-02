export const MAX_SCORE = 2999;
export const SPEED_CAP_SCORE = 1200;
export const INITIAL_LIVES = 3;
export const MAX_LIVES = 6;

/** Extra life awarded when crossing these scores (once each). */
export const LIFE_MILESTONES = [200, 500, 1000, 1200, 1500, 2200, 2500, 2999] as const;

export const MIN_SPEED_LEVEL = 1;
export const MAX_SPEED_LEVEL = 16;

/** Дискретные ряды ЖК-экрана: 0 — горизонт (верхний правый), 8 — линия автомобиля. */
export const LCD_ROW_COUNT = 8;
export const CAR_ROW = 8;
export const PASS_ROW = 9;

/** Базовый интервал смещения ряда (мс) на скорости 1 и 0 очков. */
export const BASE_ROW_STEP_MS = 420;

/** Минимальный интервал смещения ряда. */
export const MIN_ROW_STEP_MS = 95;

/** Новый барьер каждые N смещений рядов. */
export const SPAWN_EVERY_ROWS = 2;

/** Double-tap window for Game B (ms). */
export const DOUBLE_TAP_MS = 380;

/** Crash pause before resuming (ms). */
export const CRASH_PAUSE_MS = 1200;

/** LCD palette — Электроника ИМ-23 «Автослалом». */
export const LCD = {
  bg: "#b8c8a8",
  bgDark: "#9fb08a",
  segment: "#141414",
  track: "#d42030",
  trackLight: "#e83845",
} as const;

/** Корпус приставки. */
export const DEVICE = {
  body: "#e6e2d8",
  bodyEdge: "#c8c2b4",
  bodyShadow: "#b0aa9c",
  label: "#1c1c1c",
  title: "#d42030",
  button: "#d42030",
  buttonDark: "#a81828",
  buttonHighlight: "#e84555",
  pinhole: "#8a2028",
} as const;
