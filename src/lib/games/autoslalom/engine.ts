import { createBarrier, isLaneBlocked, requiresDoubleTap, resetBarrierPattern } from "./barriers";
import {
  BASE_SPAWN_MS,
  CAR_Y,
  CRASH_PAUSE_MS,
  DOUBLE_TAP_MS,
  HIT_BAND,
  INITIAL_LIVES,
  LIFE_MILESTONES,
  MAX_LIVES,
  MAX_SCORE,
  MAX_SPEED_LEVEL,
  MIN_SPAWN_MS,
  MIN_SPEED_LEVEL,
  SCORE_Y,
  SPEED_CAP_SCORE,
  TRACK_DEPTH,
} from "./constants";
import type {
  AutoslalomHighScores,
  AutoslalomMode,
  AutoslalomPhase,
  AutoslalomState,
  ClockSettings,
  Lane,
  SteerDirection,
} from "./types";

const DEFAULT_CLOCK: ClockSettings = {
  hours: 12,
  minutes: 0,
  alarmHours: 7,
  alarmMinutes: 0,
  alarmEnabled: false,
};

export function createInitialState(
  partial?: Partial<Pick<AutoslalomState, "mode" | "speedLevel" | "clock">>,
): AutoslalomState {
  return {
    phase: "idle",
    mode: partial?.mode ?? "A",
    score: 0,
    lives: INITIAL_LIVES,
    maxLives: INITIAL_LIVES,
    carLane: 1,
    speedLevel: clampSpeed(partial?.speedLevel ?? 8),
    barriers: [],
    distance: 0,
    nextBarrierId: 1,
    spawnTimer: spawnInterval(0, partial?.speedLevel ?? 8),
    awardedMilestones: [],
    invulnerableMs: 0,
    lastSteerAt: 0,
    lastSteerDir: null,
    showHighScore: false,
    clock: partial?.clock ?? { ...DEFAULT_CLOCK },
    clockEdit: "none",
    startedAt: 0,
  };
}

function clampSpeed(level: number): number {
  return Math.max(MIN_SPEED_LEVEL, Math.min(MAX_SPEED_LEVEL, Math.round(level)));
}

function clampLane(lane: number): Lane {
  return Math.max(0, Math.min(2, lane)) as Lane;
}

/** Effective scroll speed (abstract units per second). */
export function scrollSpeed(score: number, speedLevel: number): number {
  const scoreFactor = Math.min(score, SPEED_CAP_SCORE) / SPEED_CAP_SCORE;
  const levelFactor = speedLevel / MAX_SPEED_LEVEL;
  const base = 0.14 + levelFactor * 0.1;
  return base + scoreFactor * (0.55 + levelFactor * 0.25);
}

export function spawnInterval(score: number, speedLevel: number): number {
  const speed = scrollSpeed(score, speedLevel);
  const ms = BASE_SPAWN_MS / speed;
  return Math.max(MIN_SPAWN_MS, ms * (16 / speedLevel));
}

export function startGame(state: AutoslalomState, now = Date.now()): AutoslalomState {
  resetBarrierPattern(now);
  return {
    ...createInitialState({ mode: state.mode, speedLevel: state.speedLevel, clock: state.clock }),
    phase: "playing",
    startedAt: now,
    spawnTimer: spawnInterval(0, state.speedLevel),
  };
}

export function setMode(state: AutoslalomState, mode: AutoslalomMode): AutoslalomState {
  if (state.phase === "playing") return state;
  return { ...state, mode, phase: state.phase === "gameover" ? "idle" : state.phase };
}

export function setSpeedLevel(state: AutoslalomState, delta: number): AutoslalomState {
  if (state.phase === "playing") return state;
  return { ...state, speedLevel: clampSpeed(state.speedLevel + delta) };
}

export function enterClockMode(state: AutoslalomState): AutoslalomState {
  if (state.phase === "playing") return state;
  return { ...state, phase: "clock", clockEdit: "none", showHighScore: false };
}

export function exitClockMode(state: AutoslalomState): AutoslalomState {
  if (state.phase !== "clock") return state;
  return { ...state, phase: "idle", clockEdit: "none" };
}

export function setClockEdit(state: AutoslalomState, edit: AutoslalomState["clockEdit"]): AutoslalomState {
  if (state.phase !== "clock") return state;
  return { ...state, clockEdit: edit };
}

export function adjustClockTime(state: AutoslalomState, deltaMinutes: number): AutoslalomState {
  if (state.phase !== "clock") return state;
  const clock = { ...state.clock };
  if (state.clockEdit === "time") {
    let total = clock.hours * 60 + clock.minutes + deltaMinutes;
    total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
    clock.hours = Math.floor(total / 60);
    clock.minutes = total % 60;
  } else if (state.clockEdit === "alarm") {
    let total = clock.alarmHours * 60 + clock.alarmMinutes + deltaMinutes;
    total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
    clock.alarmHours = Math.floor(total / 60);
    clock.alarmMinutes = total % 60;
    clock.alarmEnabled = true;
  }
  return { ...state, clock };
}

export function toggleAlarm(state: AutoslalomState): AutoslalomState {
  if (state.phase !== "clock") return state;
  return {
    ...state,
    clock: { ...state.clock, alarmEnabled: !state.clock.alarmEnabled },
  };
}

export function setShowHighScore(state: AutoslalomState, show: boolean): AutoslalomState {
  if (state.phase === "playing") return state;
  return { ...state, showHighScore: show };
}

function applyMilestoneLives(state: AutoslalomState): AutoslalomState {
  let lives = state.lives;
  let maxLives = state.maxLives;
  const awarded = [...state.awardedMilestones];
  for (const milestone of LIFE_MILESTONES) {
    if (state.score >= milestone && !awarded.includes(milestone)) {
      awarded.push(milestone);
      if (lives < MAX_LIVES) {
        lives += 1;
        maxLives = Math.max(maxLives, lives);
      }
    }
  }
  return { ...state, lives, maxLives, awardedMilestones: awarded };
}

function steerOnce(state: AutoslalomState, dir: SteerDirection): AutoslalomState {
  const delta = dir === "left" ? -1 : 1;
  return { ...state, carLane: clampLane(state.carLane + delta) };
}

export function steer(
  state: AutoslalomState,
  dir: SteerDirection,
  now = Date.now(),
): AutoslalomState {
  if (state.phase !== "playing" || state.invulnerableMs > 0) return state;

  let next = state;
  const isDouble =
    state.lastSteerDir === dir && now - state.lastSteerAt <= DOUBLE_TAP_MS && state.mode === "B";

  next = steerOnce(next, dir);
  if (isDouble) {
    next = steerOnce(next, dir);
  }

  return {
    ...next,
    lastSteerAt: now,
    lastSteerDir: dir,
  };
}

function detectCollision(state: AutoslalomState): boolean {
  if (state.invulnerableMs > 0) return false;
  for (const barrier of state.barriers) {
    if (Math.abs(barrier.y - CAR_Y) > HIT_BAND) continue;
    if (isLaneBlocked(barrier, state.carLane)) {
      if (state.mode === "B" && requiresDoubleTap(barrier, state.mode)) {
        // Adjacent pair — allow if player double-tapped recently at this row.
        const recent = Date.now() - state.lastSteerAt <= DOUBLE_TAP_MS;
        if (recent && state.lastSteerDir) continue;
      }
      return true;
    }
  }
  return false;
}

function processScoring(state: AutoslalomState): AutoslalomState {
  let score = state.score;
  const barriers = state.barriers.map((b) => {
    if (b.scored || b.y < SCORE_Y) return b;
    if (!isLaneBlocked(b, state.carLane)) {
      score = Math.min(MAX_SCORE, score + 1);
    }
    return { ...b, scored: true };
  });

  let next = { ...state, score, barriers };
  next = applyMilestoneLives(next);
  if (next.score >= MAX_SCORE) {
    next = { ...next, phase: "gameover" as AutoslalomPhase };
  }
  return next;
}

function handleCrash(state: AutoslalomState): AutoslalomState {
  const lives = state.lives - 1;
  if (lives <= 0) {
    return { ...state, lives: 0, phase: "gameover", invulnerableMs: 0 };
  }
  return {
    ...state,
    lives,
    phase: "crash",
    invulnerableMs: CRASH_PAUSE_MS,
    barriers: state.barriers.filter((b) => b.y < CAR_Y - 0.15),
  };
}

export function tick(state: AutoslalomState, dtMs: number): AutoslalomState {
  if (state.phase === "crash") {
    const invulnerableMs = Math.max(0, state.invulnerableMs - dtMs);
    if (invulnerableMs <= 0) {
      return { ...state, phase: "playing", invulnerableMs: 0 };
    }
    return { ...state, invulnerableMs };
  }

  if (state.phase !== "playing") return state;

  const dtSec = dtMs / 1000;
  const speed = scrollSpeed(state.score, state.speedLevel);
  const invulnerableMs = Math.max(0, state.invulnerableMs - dtMs);

  let barriers = state.barriers
    .map((b) => ({ ...b, y: b.y + speed * dtSec }))
    .filter((b) => b.y <= TRACK_DEPTH + 0.1);

  let spawnTimer = state.spawnTimer - dtMs;
  let nextBarrierId = state.nextBarrierId;

  if (spawnTimer <= 0) {
    barriers.push(createBarrier(nextBarrierId, state.mode, 0.02));
    nextBarrierId += 1;
    spawnTimer = spawnInterval(state.score, state.speedLevel);
  }

  let next: AutoslalomState = {
    ...state,
    barriers,
    spawnTimer,
    nextBarrierId,
    distance: state.distance + speed * dtSec,
    invulnerableMs,
  };

  next = processScoring(next);

  if (detectCollision(next)) {
    next = handleCrash(next);
  }

  return next;
}

export function tickClock(state: AutoslalomState, now: Date): AutoslalomState {
  if (state.phase !== "clock" || state.clockEdit !== "none") return state;
  const clock = { ...state.clock, hours: now.getHours(), minutes: now.getMinutes() };
  return { ...state, clock };
}

export function isAlarmRinging(state: AutoslalomState, now: Date): boolean {
  if (state.phase !== "clock" || !state.clock.alarmEnabled) return false;
  return now.getHours() === state.clock.alarmHours && now.getMinutes() === state.clock.alarmMinutes;
}

export function updateHighScore(
  highScores: AutoslalomHighScores,
  mode: AutoslalomMode,
  score: number,
): AutoslalomHighScores {
  if (score <= highScores[mode]) return highScores;
  return { ...highScores, [mode]: score };
}

export function formatScoreDisplay(score: number): string {
  return String(Math.min(MAX_SCORE, Math.max(0, score))).padStart(4, " ");
}

export function formatClockDisplay(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, " ")}${String(minutes).padStart(2, "0")}`;
}

export { DEFAULT_CLOCK };
