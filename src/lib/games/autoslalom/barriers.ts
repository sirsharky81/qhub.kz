import type { AutoslalomMode, Barrier, Lane } from "./types";

let patternSeed = 0;

export function resetBarrierPattern(seed = Date.now()): void {
  patternSeed = seed >>> 0;
}

function nextRand(): number {
  patternSeed = (patternSeed * 1664525 + 1013904223) >>> 0;
  return patternSeed / 0x100000000;
}

/** Game A: single lane or two opposite lanes. Game B: adds adjacent pairs. */
export function generateBarrierLanes(mode: AutoslalomMode): Lane[] {
  const r = nextRand();

  if (mode === "A") {
    if (r < 0.45) {
      return [Math.floor(nextRand() * 3) as Lane];
    }
    return r < 0.725 ? [0, 2] : [2, 0];
  }

  if (r < 0.3) {
    return [Math.floor(nextRand() * 3) as Lane];
  }
  if (r < 0.5) {
    return [0, 2];
  }
  if (r < 0.75) {
    return nextRand() < 0.5 ? ([0, 1] as Lane[]) : ([1, 2] as Lane[]);
  }
  return nextRand() < 0.5 ? ([0, 1] as Lane[]) : ([1, 2] as Lane[]);
}

export function createBarrier(id: number, mode: AutoslalomMode, row = 0): Barrier {
  return {
    id,
    row,
    lanes: generateBarrierLanes(mode),
    scored: false,
  };
}

export function isLaneBlocked(barrier: Barrier, lane: Lane): boolean {
  return barrier.lanes.includes(lane);
}

/** True when Game B adjacent pair requires a double steer to slip through. */
export function requiresDoubleTap(barrier: Barrier, mode: AutoslalomMode): boolean {
  if (mode !== "B" || barrier.lanes.length !== 2) return false;
  const sorted = [...barrier.lanes].sort();
  return sorted[0] + 1 === sorted[1];
}
