import type { SpiderAction, SpiderState } from "./types";
import { findCompleteRunStart, getLegalMoveTargets, isValidMoveStackSegment } from "./validators";

export type SpiderHint =
  | Extract<SpiderAction, { type: "move_stack" }>
  | { type: "deal_stock" };

function scoreMove(state: SpiderState, move: Extract<SpiderAction, { type: "move_stack" }>): number {
  const source = state.columns[move.fromColumn]!;
  const segment = source.slice(move.fromIndex);
  if (!isValidMoveStackSegment(segment)) return -1;

  let score = 0;
  const target = state.columns[move.toColumn]!;
  if (target.length === 0) score += 30;

  const revealsHidden = move.fromIndex > 0 && !source[move.fromIndex - 1]!.faceUp;
  if (revealsHidden) score += 50;

  const nextColumn = [...source.slice(0, move.fromIndex)];
  if (nextColumn.length > 0 && !nextColumn[nextColumn.length - 1]!.faceUp) {
    score += 50;
  }

  if (segment.length > 1) score += 10;

  const simulatedTarget = [...target, ...segment];
  if (findCompleteRunStart(simulatedTarget) !== null) score += 200;

  score -= move.fromIndex * 2;
  return score;
}

export function findSpiderHint(state: SpiderState): SpiderHint | null {
  if (state.phase !== "playing") return null;

  const moves: Extract<SpiderAction, { type: "move_stack" }>[] = [];
  for (let fromColumn = 0; fromColumn < state.columns.length; fromColumn++) {
    const column = state.columns[fromColumn]!;
    for (let fromIndex = 0; fromIndex < column.length; fromIndex++) {
      for (const toColumn of getLegalMoveTargets(state, fromColumn, fromIndex)) {
        moves.push({ type: "move_stack", fromColumn, fromIndex, toColumn });
      }
    }
  }

  if (moves.length === 0) {
    return state.stock.length >= 10 && !state.columns.some((c) => c.length === 0)
      ? { type: "deal_stock" }
      : null;
  }

  return moves.reduce((best, move) => {
    const bestScore = scoreMove(state, best);
    const moveScore = scoreMove(state, move);
    return moveScore > bestScore ? move : best;
  });
}
