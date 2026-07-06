import type { CardSuit } from "@/lib/games/cards/types";
import type { SpiderAction, SpiderColumnCard, SpiderState } from "./types";
import { findCompleteRunStart, isValidMoveStackSegment } from "./validators";

function flipTop(column: SpiderColumnCard[]): SpiderColumnCard[] {
  if (column.length === 0) return column;
  const top = column[column.length - 1]!;
  if (top.faceUp) return column;
  const next = [...column];
  next[next.length - 1] = { ...top, faceUp: true };
  return next;
}

function cloneColumns(columns: SpiderColumnCard[][]): SpiderColumnCard[][] {
  return columns.map((col) => col.map((entry) => ({ ...entry, card: { ...entry.card } })));
}

export function simulateSpiderAction(state: SpiderState, action: SpiderAction): SpiderState | null {
  if (action.type === "move_stack") {
    const columns = cloneColumns(state.columns);
    const source = columns[action.fromColumn];
    const target = columns[action.toColumn];
    if (!source || !target) return null;
    const segment = source.slice(action.fromIndex);
    if (!isValidMoveStackSegment(segment)) return null;
    const moved = source.splice(action.fromIndex);
    target.push(...moved);
    columns[action.fromColumn] = flipTop(columns[action.fromColumn]!);
    return { ...state, columns };
  }
  if (action.type === "deal_stock") {
    if (state.stock.length < 10) return null;
    const columns = cloneColumns(state.columns);
    for (let i = 0; i < 10; i++) {
      columns[i]!.push({ card: state.stock[i]!, faceUp: true });
    }
    return { ...state, columns, stock: state.stock.slice(10) };
  }
  return null;
}

export function findRunsCompletedByAction(
  state: SpiderState,
  action: SpiderAction,
): Array<{ column: number; suit: CardSuit }> {
  const simulated = simulateSpiderAction(state, action);
  if (!simulated) return [];
  const found: Array<{ column: number; suit: CardSuit }> = [];
  for (let col = 0; col < simulated.columns.length; col++) {
    const start = findCompleteRunStart(simulated.columns[col]!);
    if (start !== null) {
      found.push({ column: col, suit: simulated.columns[col]![start]!.card.suit });
    }
  }
  return found;
}
