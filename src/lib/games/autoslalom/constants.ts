export const MAX_SCORE = 2999;
export const SPEED_CAP_SCORE = 1200;
export const INITIAL_LIVES = 3;
export const MAX_LIVES = 6;

/** Extra life awarded when crossing these scores (once each). */
export const LIFE_MILESTONES = [200, 500, 1000, 1200, 1500, 2200, 2500, 2999] as const;

export const MIN_SPEED_LEVEL = 1;
export const MAX_SPEED_LEVEL = 16;

/** Base ms between barrier rows at speed level 1 and score 0. */
export const BASE_SPAWN_MS = 2200;

/** Minimum ms between spawns at max difficulty. */
export const MIN_SPAWN_MS = 450;

/** Barrier travel distance in abstract units (0 = horizon, 1 = car line). */
export const TRACK_DEPTH = 1;

/** Y position of the car (0 top, 1 bottom). */
export const CAR_Y = 0.88;

/** Collision band half-height. */
export const HIT_BAND = 0.045;

/** Score line — barrier counted when its center passes below this. */
export const SCORE_Y = CAR_Y + 0.06;

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
