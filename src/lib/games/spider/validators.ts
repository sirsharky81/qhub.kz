import type { CardRank, PlayingCard } from "@/lib/games/cards/types";
import type { SpiderColumnCard, SpiderState } from "./types";

export const SPIDER_RUN_LENGTH = 13;
export const SPIDER_TOTAL_RUNS = 8;

/** Ace is low in Spider (after 2). */
export function spiderRankValue(rank: CardRank): number {
  return rank === 14 ? 1 : rank;
}

export function isSameSuitDescending(cards: readonly PlayingCard[]): boolean {
  if (cards.length <= 1) return true;
  for (let i = 1; i < cards.length; i++) {
    const prev = cards[i - 1]!;
    const curr = cards[i]!;
    if (curr.suit !== prev.suit) return false;
    if (spiderRankValue(curr.rank) !== spiderRankValue(prev.rank) - 1) return false;
  }
  return true;
}

export function canPlaceStack(stack: readonly PlayingCard[], targetTop: PlayingCard | null): boolean {
  if (stack.length === 0) return false;
  if (!targetTop) {
    return stack.length === 1 || isSameSuitDescending(stack);
  }
  const bottom = stack[0]!;
  return spiderRankValue(bottom.rank) === spiderRankValue(targetTop.rank) - 1;
}

export function isValidMoveStackSegment(segment: readonly SpiderColumnCard[]): boolean {
  if (segment.length === 0) return false;
  if (!segment.every((entry) => entry.faceUp)) return false;
  return isSameSuitDescending(segment.map((entry) => entry.card));
}

export function findCompleteRunStart(column: readonly SpiderColumnCard[]): number | null {
  if (column.length < SPIDER_RUN_LENGTH) return null;
  for (let start = column.length - SPIDER_RUN_LENGTH; start >= 0; start--) {
    const segment = column.slice(start, start + SPIDER_RUN_LENGTH);
    if (!segment.every((entry) => entry.faceUp)) continue;
    const cards = segment.map((entry) => entry.card);
    if (!isSameSuitDescending(cards)) continue;
    if (spiderRankValue(cards[0]!.rank) !== 13) continue;
    if (spiderRankValue(cards[cards.length - 1]!.rank) !== 1) continue;
    return start;
  }
  return null;
}

export function hasEmptyColumn(state: SpiderState): boolean {
  return state.columns.some((column) => column.length === 0);
}

export function canDealStock(state: SpiderState): boolean {
  if (state.phase !== "playing") return false;
  if (state.stock.length < 10) return false;
  if (hasEmptyColumn(state)) return false;
  return true;
}

export function getLegalMoveTargets(
  state: SpiderState,
  fromColumn: number,
  fromIndex: number,
): number[] {
  const column = state.columns[fromColumn];
  if (!column) return [];
  const segment = column.slice(fromIndex);
  if (!isValidMoveStackSegment(segment)) return [];
  const stack = segment.map((entry) => entry.card);
  const targets: number[] = [];
  for (let toColumn = 0; toColumn < state.columns.length; toColumn++) {
    if (toColumn === fromColumn) continue;
    const target = state.columns[toColumn]!;
    const targetTop = target.length > 0 ? target[target.length - 1]!.card : null;
    if (canPlaceStack(stack, targetTop)) {
      targets.push(toColumn);
    }
  }
  return targets;
}

export function hasAnyLegalMove(state: SpiderState): boolean {
  for (let fromColumn = 0; fromColumn < state.columns.length; fromColumn++) {
    const column = state.columns[fromColumn]!;
    for (let fromIndex = 0; fromIndex < column.length; fromIndex++) {
      if (getLegalMoveTargets(state, fromColumn, fromIndex).length > 0) {
        return true;
      }
    }
  }
  return false;
}
