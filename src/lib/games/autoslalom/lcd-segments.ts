import type { AutoslalomState } from "./types";
import { CAR_ROW } from "./constants";
import { barrierId } from "./lcd-layout";

/** Активные id сегментов ЖК для текущего кадра. */
export function buildActiveSegmentIds(state: AutoslalomState, blink: boolean): Set<string> {
  const ids = new Set<string>();

  if (state.phase === "playing" || state.phase === "crash") {
    if (!blink) ids.add(`car-${state.carLane}`);
    for (const b of state.barriers) {
      if (b.row < 0 || b.row >= CAR_ROW) continue;
      for (const lane of b.lanes) {
        ids.add(barrierId(b.row, lane));
      }
    }
  } else if (state.phase === "idle" || state.phase === "gameover") {
    ids.add("car-1");
  }

  for (let i = 0; i < state.maxLives; i++) {
    if (i < state.lives) ids.add(`life-${i}`);
  }

  ids.add(`mode-${state.mode}`);

  return ids;
}

export function scoreDigitChars(state: AutoslalomState, highScore: number): string[] {
  const val = state.showHighScore ? highScore : state.score;
  const s = String(Math.min(9999, Math.max(0, val)));
  if (s.length <= 3) return [" ", ...s.padStart(3, " ").split("")];
  return s.padStart(4, " ").split("");
}

export function clockDigitChars(state: AutoslalomState, now: Date): string[] {
  const h = state.clockEdit === "none" ? now.getHours() : state.clock.hours;
  const m = state.clockEdit === "none" ? now.getMinutes() : state.clock.minutes;
  const hs = String(h).padStart(2, " ");
  const ms = String(m).padStart(2, "0");
  return [hs[0], hs[1], ms[0], ms[1]];
}
