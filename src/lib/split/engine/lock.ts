import type { DebtSettlement, SplitExpense, SplitRoom } from "../types";

/** After any DebtSettlement exists in the room, all expenses are locked for edit/delete. */
export function areExpensesLocked(settlements: readonly DebtSettlement[]): boolean {
  return settlements.length > 0;
}

export function withExpenseLockState(
  expenses: readonly SplitExpense[],
  settlements: readonly DebtSettlement[],
): SplitExpense[] {
  const locked = areExpensesLocked(settlements);
  return expenses.map((e) => ({ ...e, locked }));
}

export function canMutateExpense(
  expense: SplitExpense | null | undefined,
  settlements: readonly DebtSettlement[],
): boolean {
  if (!expense) return false;
  if (areExpensesLocked(settlements)) return false;
  return !expense.locked;
}

export function canMutateRoom(room: SplitRoom): boolean {
  return room.status === "open";
}

export function canArchiveRoom(balancesSettled: boolean, room: SplitRoom): boolean {
  return room.status === "open" && balancesSettled;
}
