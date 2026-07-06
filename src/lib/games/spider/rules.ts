import type { GameDefinition, GameValidationResult } from "@/lib/games/core/types";
import { createShuffledSpiderDeal } from "./deck";
import type { SpiderAction, SpiderColumnCard, SpiderState, SpiderSuitMode } from "./types";
import {
  SPIDER_TOTAL_RUNS,
  canDealStock,
  canPlaceStack,
  findCompleteRunStart,
  getLegalMoveTargets,
  hasAnyLegalMove,
  hasEmptyColumn,
  isValidMoveStackSegment,
} from "./validators";

function createGameId(): string {
  return `spider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createInitialSpiderState(suitMode: SpiderSuitMode = 1): SpiderState {
  const { columns, stock } = createShuffledSpiderDeal(suitMode);
  let state: SpiderState = {
    gameId: createGameId(),
    phase: "playing",
    suitMode,
    columns,
    stock,
    completedRuns: 0,
    moves: 0,
    startedAt: Date.now(),
  };
  state = autoRemoveCompleteRuns(state);
  return state;
}

function flipTopFaceDown(column: SpiderColumnCard[]): SpiderColumnCard[] {
  if (column.length === 0) return column;
  const topIndex = column.length - 1;
  const top = column[topIndex]!;
  if (top.faceUp) return column;
  const next = [...column];
  next[topIndex] = { ...top, faceUp: true };
  return next;
}

export function autoRemoveCompleteRuns(state: SpiderState): SpiderState {
  let nextState = state;
  let changed = true;
  while (changed) {
    changed = false;
    const columns = nextState.columns.map((column) => [...column]);
    for (let col = 0; col < columns.length; col++) {
      const runStart = findCompleteRunStart(columns[col]!);
      if (runStart === null) continue;
      columns[col] = columns[col]!.slice(0, runStart);
      columns[col] = flipTopFaceDown(columns[col]!);
      nextState = {
        ...nextState,
        columns,
        completedRuns: nextState.completedRuns + 1,
      };
      changed = true;
      break;
    }
  }
  if (nextState.completedRuns >= SPIDER_TOTAL_RUNS) {
    return { ...nextState, phase: "won" };
  }
  return nextState;
}

function resolveStuckPhase(state: SpiderState): SpiderState {
  if (state.phase !== "playing") return state;
  if (canDealStock(state)) return state;
  if (hasAnyLegalMove(state)) return state;
  return { ...state, phase: "stuck" };
}

function applyMoveStack(state: SpiderState, action: Extract<SpiderAction, { type: "move_stack" }>): SpiderState {
  const { fromColumn, fromIndex, toColumn } = action;
  const source = state.columns[fromColumn];
  const target = state.columns[toColumn];
  if (!source || !target) return state;
  const segment = source.slice(fromIndex);
  if (!isValidMoveStackSegment(segment)) return state;
  const stack = segment.map((entry) => entry.card);
  const targetTop = target.length > 0 ? target[target.length - 1]!.card : null;
  if (!canPlaceStack(stack, targetTop)) return state;

  const nextColumns = state.columns.map((column) => [...column]);
  const moved = nextColumns[fromColumn]!.splice(fromIndex);
  nextColumns[toColumn]!.push(...moved);
  nextColumns[fromColumn] = flipTopFaceDown(nextColumns[fromColumn]!);

  let nextState: SpiderState = {
    ...state,
    columns: nextColumns,
    moves: state.moves + 1,
  };
  nextState = autoRemoveCompleteRuns(nextState);
  return resolveStuckPhase(nextState);
}

function applyDealStock(state: SpiderState): SpiderState {
  if (!canDealStock(state)) return state;
  const nextColumns = state.columns.map((column, index) => {
    const card = state.stock[index]!;
    return [...column, { card, faceUp: true }];
  });
  let nextState: SpiderState = {
    ...state,
    columns: nextColumns,
    stock: state.stock.slice(10),
    moves: state.moves + 1,
  };
  nextState = autoRemoveCompleteRuns(nextState);
  return resolveStuckPhase(nextState);
}

function validateMoveStack(
  state: SpiderState,
  action: Extract<SpiderAction, { type: "move_stack" }>,
): GameValidationResult {
  if (state.phase !== "playing") {
    return { ok: false, reason: "Игра уже завершена" };
  }
  const { fromColumn, fromIndex, toColumn } = action;
  if (fromColumn === toColumn) {
    return { ok: false, reason: "Нельзя переместить карту в тот же столбец" };
  }
  if (fromColumn < 0 || fromColumn >= state.columns.length) {
    return { ok: false, reason: "Неверный исходный столбец" };
  }
  if (toColumn < 0 || toColumn >= state.columns.length) {
    return { ok: false, reason: "Неверный целевой столбец" };
  }
  const column = state.columns[fromColumn]!;
  if (fromIndex < 0 || fromIndex >= column.length) {
    return { ok: false, reason: "Неверная карта" };
  }
  const segment = column.slice(fromIndex);
  if (!isValidMoveStackSegment(segment)) {
    return { ok: false, reason: "Можно переносить только открытую последовательность одной масти" };
  }
  const targets = getLegalMoveTargets(state, fromColumn, fromIndex);
  if (!targets.includes(toColumn)) {
    return { ok: false, reason: "Недопустимый ход" };
  }
  return { ok: true };
}

export function createSpiderDefinition(params?: { suitMode?: SpiderSuitMode }): GameDefinition<
  SpiderState,
  SpiderAction
> {
  const defaultSuitMode = params?.suitMode ?? 1;
  return {
    gameId: "spider",
    initialState: () => createInitialSpiderState(defaultSuitMode),
    validateAction: (state, action) => {
      if (action.type === "new_game") return { ok: true };
      if (action.type === "deal_stock") {
        if (!canDealStock(state)) {
          if (hasEmptyColumn(state)) {
            return { ok: false, reason: "Перед добором заполните все пустые столбцы" };
          }
          return { ok: false, reason: "Добор сейчас невозможен" };
        }
        return { ok: true };
      }
      return validateMoveStack(state, action);
    },
    applyAction: (state, action) => {
      if (action.type === "new_game") {
        return createInitialSpiderState(action.suitMode);
      }
      if (action.type === "deal_stock") {
        return applyDealStock(state);
      }
      return applyMoveStack(state, action);
    },
    getLegalActions: (state) => {
      const actions: SpiderAction[] = [];
      if (state.phase !== "playing") return actions;
      for (let fromColumn = 0; fromColumn < state.columns.length; fromColumn++) {
        const column = state.columns[fromColumn]!;
        for (let fromIndex = 0; fromIndex < column.length; fromIndex++) {
          for (const toColumn of getLegalMoveTargets(state, fromColumn, fromIndex)) {
            actions.push({ type: "move_stack", fromColumn, fromIndex, toColumn });
          }
        }
      }
      if (canDealStock(state)) {
        actions.push({ type: "deal_stock" });
      }
      return actions;
    },
    isRoundFinished: () => false,
    scoreRound: (state) => state,
    isGameFinished: (state) => state.phase === "won" || state.phase === "stuck",
  };
}
