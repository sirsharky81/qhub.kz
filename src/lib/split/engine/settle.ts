import { d, money } from "../decimal";
import type { MemberBalance, SuggestedSettlement } from "../types";

/**
 * Greedy settlement suggestions (TZ §8):
 * sort creditors desc, debtors by debt desc; repeatedly settle head pair.
 */
export function suggestSettlements(balances: readonly MemberBalance[]): SuggestedSettlement[] {
  const creditors = balances
    .filter((b) => d(b.netBase).gt(0))
    .map((b) => ({ memberId: b.memberId, amount: d(b.netBase) }))
    .sort((a, b) => b.amount.comparedTo(a.amount) || a.memberId.localeCompare(b.memberId));

  const debtors = balances
    .filter((b) => d(b.netBase).lt(0))
    .map((b) => ({ memberId: b.memberId, amount: d(b.netBase).abs() }))
    .sort((a, b) => b.amount.comparedTo(a.amount) || a.memberId.localeCompare(b.memberId));

  const suggestions: SuggestedSettlement[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;
    const pay = debtor.amount.lte(creditor.amount) ? debtor.amount : creditor.amount;
    if (pay.gt(0)) {
      suggestions.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amountBase: money(pay),
      });
    }
    debtor.amount = debtor.amount.minus(pay);
    creditor.amount = creditor.amount.minus(pay);
    if (debtor.amount.lte(0)) i += 1;
    if (creditor.amount.lte(0)) j += 1;
  }

  return suggestions;
}

export function areBalancesSettled(balances: readonly MemberBalance[]): boolean {
  return balances.every((b) => d(b.netBase).eq(0));
}
