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

/** LCD palette matching ИМ-23. */
export const LCD = {
  bg: "#c8d4c4",
  bgDark: "#b0bea8",
  segment: "#1a1a1a",
  track: "#c41e3a",
  trackLight: "#d94050",
  label: "#1a1a1a",
  title: "#c41e3a",
} as const;
