import type { DebtSettlement, SplitExpense } from "../types";
import type { ExpenseOperation, SettlementOperation, SplitOperation } from "./types";

/** Map legacy v3.3 expense/settlement records into ledger operations. */
export function operationsFromLegacy(input: {
  expenses: readonly SplitExpense[];
  settlements: readonly DebtSettlement[];
}): SplitOperation[] {
  const ops: SplitOperation[] = [];

  for (const e of input.expenses) {
    const op: ExpenseOperation = {
      id: e.id,
      roomId: e.roomId,
      type: "expense",
      createdAt: e.createdAt,
      createdBy: e.createdBy,
      comment: e.comment,
      clientMutationId: e.clientMutationId,
      locked: e.locked,
      description: e.description,
      amountOriginal: e.amountOriginal,
      currencyOriginal: e.currencyOriginal,
      exchangeRate: e.exchangeRate,
      amountBase: e.amountBase,
      categoryId: e.categoryId,
      paymentSource: { kind: "member", memberId: e.paidByMemberId },
      splitMethod: e.splitMethod,
      participants: e.participants,
      personal: e.personal,
    };
    ops.push(op);
  }

  for (const s of input.settlements) {
    const op: SettlementOperation = {
      id: s.id,
      roomId: s.roomId,
      type: "settlement",
      createdAt: s.createdAt,
      createdBy: s.createdBy,
      comment: s.comment,
      clientMutationId: s.clientMutationId,
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amountBase: s.amountBase,
      status: s.status,
      confirmedBy: s.confirmedBy,
      confirmedAt: s.confirmedAt,
    };
    ops.push(op);
  }

  // Array.prototype.sort is stable (guaranteed since ES2019), so operations created
  // within the same millisecond keep their original (true creation) relative order
  // instead of being reshuffled by an unrelated, effectively-random id comparison.
  ops.sort((a, b) => a.createdAt - b.createdAt);
  return ops;
}
