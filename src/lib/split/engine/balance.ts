import { d, eqMoney, money, zeroMoney } from "../decimal";
import type { DebtSettlement, MemberBalance, Money, SplitExpense } from "../types";
import { SplitValidationError } from "./shares";

export function computeBalances(
  memberIds: readonly string[],
  expenses: readonly SplitExpense[],
  settlements: readonly DebtSettlement[],
): MemberBalance[] {
  const paid = new Map<string, ReturnType<typeof d>>();
  const share = new Map<string, ReturnType<typeof d>>();
  for (const id of memberIds) {
    paid.set(id, d(0));
    share.set(id, d(0));
  }

  for (const expense of expenses) {
    if (!paid.has(expense.paidByMemberId)) {
      paid.set(expense.paidByMemberId, d(0));
      share.set(expense.paidByMemberId, d(0));
    }
    paid.set(expense.paidByMemberId, paid.get(expense.paidByMemberId)!.plus(d(expense.amountBase)));
    for (const p of expense.participants) {
      if (!share.has(p.memberId)) {
        paid.set(p.memberId, d(0));
        share.set(p.memberId, d(0));
      }
      share.set(p.memberId, share.get(p.memberId)!.plus(d(p.amountBase)));
    }
  }

  for (const s of settlements) {
    if (!paid.has(s.fromMemberId)) {
      paid.set(s.fromMemberId, d(0));
      share.set(s.fromMemberId, d(0));
    }
    if (!paid.has(s.toMemberId)) {
      paid.set(s.toMemberId, d(0));
      share.set(s.toMemberId, d(0));
    }
    // Settlement: debtor pays creditor → from paid increases, to share increases
    // Equivalent effect on net (Paid - Share): from += amount, to -= amount
    paid.set(s.fromMemberId, paid.get(s.fromMemberId)!.plus(d(s.amountBase)));
    share.set(s.toMemberId, share.get(s.toMemberId)!.plus(d(s.amountBase)));
  }

  const balances: MemberBalance[] = [];
  const ids = new Set([...memberIds, ...paid.keys()]);
  for (const memberId of ids) {
    const paidBase = money(paid.get(memberId) ?? 0);
    const shareBase = money(share.get(memberId) ?? 0);
    const netBase = money(d(paidBase).minus(d(shareBase)));
    balances.push({ memberId, paidBase, shareBase, netBase });
  }

  assertBalancesSumZero(balances);
  return balances;
}

export function assertBalancesSumZero(balances: readonly MemberBalance[]): void {
  const sum = balances.reduce((acc, b) => acc.plus(d(b.netBase)), d(0));
  if (!eqMoney(money(sum), zeroMoney())) {
    throw new SplitValidationError("balances_not_zero_sum");
  }
}

export function getNetMap(balances: readonly MemberBalance[]): Map<string, Money> {
  return new Map(balances.map((b) => [b.memberId, b.netBase]));
}

/** Max amount `from` can settle to `to` given current nets. */
export function maxSettlementAmount(
  balances: readonly MemberBalance[],
  fromMemberId: string,
  toMemberId: string,
): Money {
  const nets = getNetMap(balances);
  const fromNet = d(nets.get(fromMemberId) ?? "0");
  const toNet = d(nets.get(toMemberId) ?? "0");
  if (fromNet.gte(0) || toNet.lte(0)) return zeroMoney();
  return money(DecimalMin(fromNet.abs(), toNet));
}

function DecimalMin(a: ReturnType<typeof d>, b: ReturnType<typeof d>) {
  return a.lte(b) ? a : b;
}

export function assertSettlementAllowed(
  balances: readonly MemberBalance[],
  fromMemberId: string,
  toMemberId: string,
  amountBase: Money,
): void {
  if (fromMemberId === toMemberId) throw new SplitValidationError("settlement_same_member");
  if (!d(amountBase).gt(0)) throw new SplitValidationError("invalid_settlement_amount");
  const max = maxSettlementAmount(balances, fromMemberId, toMemberId);
  if (d(amountBase).gt(d(max))) {
    throw new SplitValidationError("settlement_exceeds_debt");
  }
}

export function canLeaveRoom(balances: readonly MemberBalance[], memberId: string): boolean {
  const bal = balances.find((b) => b.memberId === memberId);
  if (!bal) return true;
  return eqMoney(bal.netBase, zeroMoney());
}
