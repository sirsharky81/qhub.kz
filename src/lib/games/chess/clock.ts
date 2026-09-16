import type { ChessColor, ChessEndReason, ChessState } from "./types";
import { playerByColor } from "./types";

export function remainingClockMs(state: ChessState, color: ChessColor, now: number): number {
  const stored = color === "w" ? state.whiteMs : state.blackMs;
  if (state.phase !== "playing" || !state.clocksRunning || now <= 0) return stored;
  if (state.currentTurn !== color) return stored;
  return Math.max(0, stored - (now - state.lastMoveAt));
}

export function formatClock(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < 10_000) {
    const seconds = safe / 1000;
    return seconds.toFixed(1);
  }
  const totalSec = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function freezeClocks(state: ChessState, now: number, flagged: ChessColor | null): Pick<
  ChessState,
  "whiteMs" | "blackMs" | "clocksRunning"
> {
  return {
    clocksRunning: false,
    whiteMs: flagged === "w" ? 0 : remainingClockMs(state, "w", now),
    blackMs: flagged === "b" ? 0 : remainingClockMs(state, "b", now),
  };
}

export function finishByReason(
  state: ChessState,
  now: number,
  input: {
    reason: ChessEndReason;
    winnerId: string | null;
    winnerColor: ChessColor | null;
    flagged?: ChessColor | null;
  },
): ChessState {
  return {
    ...state,
    phase: "finished",
    drawOfferedBy: null,
    winnerId: input.winnerId,
    winnerColor: input.winnerColor,
    endReason: input.reason,
    ...freezeClocks(state, now, input.flagged ?? null),
  };
}

export function applyClockTimeout(state: ChessState, now: number): ChessState {
  if (state.phase !== "playing" || !state.clocksRunning) return state;
  if (remainingClockMs(state, state.currentTurn, now) > 0) return state;
  const loser = playerByColor(state, state.currentTurn);
  const winner = playerByColor(state, state.currentTurn === "w" ? "b" : "w");
  return finishByReason(state, now, {
    reason: "timeout",
    winnerId: winner?.id ?? null,
    winnerColor: winner?.color ?? null,
    flagged: loser?.color ?? state.currentTurn,
  });
}

export function consumeTimeForMove(
  state: ChessState,
  now: number,
): { timedOut: boolean; state: ChessState } {
  const flagged = applyClockTimeout(state, now);
  if (flagged.phase === "finished") {
    return { timedOut: true, state: flagged };
  }
  const elapsed = Math.max(0, now - state.lastMoveAt);
  const isWhite = state.currentTurn === "w";
  const nextWhite = isWhite ? state.whiteMs - elapsed + state.incrementMs : state.whiteMs;
  const nextBlack = isWhite ? state.blackMs : state.blackMs - elapsed + state.incrementMs;
  return {
    timedOut: false,
    state: {
      ...state,
      whiteMs: Math.max(0, nextWhite),
      blackMs: Math.max(0, nextBlack),
      lastMoveAt: now,
    },
  };
}
