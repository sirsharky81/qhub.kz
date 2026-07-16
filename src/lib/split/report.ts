import { d, money, zeroMoney } from "./decimal";
import type { SplitOperation } from "./ledger";
import type { MemberBalance, Money } from "./types";

export interface CategoryReportItem {
  categoryId: string;
  totalBase: Money;
}

export interface MemberReportItem {
  memberId: string;
  /** Total personally paid across all expenses (member- or asset-sourced don't count here — see contributedBase). */
  paidBase: Money;
  /** Total share of all expenses allocated to this member. */
  shareBase: Money;
  /** paidBase − shareBase, ledger-aware (see computeEffectiveBalances). Positive = owed money. */
  netBase: Money;
  /** Sum of expenses this member paid that are flagged "personal" — not part of
   * the shared totals below, just their own tracked spending. */
  personalExpensesBase: Money;
  /** Money put into shared assets ("касса"). */
  contributedBase: Money;
  /** Money taken out of shared assets, confirmed or not. */
  withdrawnBase: Money;
  /** Confirmed settlements paid by this member (as fromMemberId). */
  settledOutBase: Money;
  /** Confirmed settlements received by this member (as toMemberId). */
  settledInBase: Money;
  /** Settlements this member paid but the recipient hasn't confirmed yet. */
  pendingSettlementsOut: number;
  /** Settlements owed to this member that they haven't confirmed receipt of yet. */
  pendingSettlementsIn: number;
  /** Withdrawals paid out to this member that they haven't confirmed receipt of yet. */
  pendingWithdrawalsIn: number;
}

export interface SplitReport {
  /** Sum of non-personal expenses only — the group's actual shared spending. */
  totalExpensesBase: Money;
  /** Category breakdown, non-personal expenses only. */
  byCategory: CategoryReportItem[];
  /** Sum of expenses flagged "personal" across everyone — for context only,
   * already excluded from totalExpensesBase/byCategory. */
  totalPersonalExpensesBase: Money;
  totalAssetsBase: Money;
  members: MemberReportItem[];
}

/**
 * Pure aggregation over the room's full operation history (legacy expenses/settlements
 * folded together with ledger operations — same list `getLedgerSnapshot` already builds)
 * plus the already-computed per-member balances (see computeEffectiveBalances).
 */
export function computeSplitReport(input: {
  memberIds: readonly string[];
  operations: readonly SplitOperation[];
  memberBalances: readonly MemberBalance[];
  totalAssetsBase: Money;
}): SplitReport {
  const { memberIds, operations, memberBalances, totalAssetsBase } = input;

  const categoryTotals = new Map<string, ReturnType<typeof d>>();
  const personalExpenses = new Map<string, ReturnType<typeof d>>();
  const contributed = new Map<string, ReturnType<typeof d>>();
  const withdrawn = new Map<string, ReturnType<typeof d>>();
  const settledOut = new Map<string, ReturnType<typeof d>>();
  const settledIn = new Map<string, ReturnType<typeof d>>();
  const pendingSettlementsOut = new Map<string, number>();
  const pendingSettlementsIn = new Map<string, number>();
  const pendingWithdrawalsIn = new Map<string, number>();

  const bump = (map: Map<string, ReturnType<typeof d>>, key: string, amount: Money) => {
    map.set(key, (map.get(key) ?? d(0)).plus(d(amount)));
  };
  const bumpCount = (map: Map<string, number>, key: string) => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  let totalExpenses = d(0);
  let totalPersonalExpenses = d(0);

  for (const op of operations) {
    switch (op.type) {
      case "expense": {
        if (op.personal) {
          totalPersonalExpenses = totalPersonalExpenses.plus(d(op.amountBase));
          const payer =
            op.paymentSource.kind === "member" ? op.paymentSource.memberId : undefined;
          if (payer) bump(personalExpenses, payer, op.amountBase);
          break;
        }
        totalExpenses = totalExpenses.plus(d(op.amountBase));
        bump(categoryTotals, op.categoryId, op.amountBase);
        break;
      }
      case "contribution": {
        bump(contributed, op.fromMemberId, op.amountBase);
        break;
      }
      case "withdrawal": {
        bump(withdrawn, op.toMemberId, op.amountBase);
        if (op.status !== "confirmed") bumpCount(pendingWithdrawalsIn, op.toMemberId);
        break;
      }
      case "settlement": {
        if (op.status === "confirmed") {
          bump(settledOut, op.fromMemberId, op.amountBase);
          bump(settledIn, op.toMemberId, op.amountBase);
        } else {
          bumpCount(pendingSettlementsOut, op.fromMemberId);
          bumpCount(pendingSettlementsIn, op.toMemberId);
        }
        break;
      }
      default:
        break;
    }
  }

  const byCategory: CategoryReportItem[] = Array.from(categoryTotals.entries())
    .map(([categoryId, total]) => ({ categoryId, totalBase: money(total) }))
    .sort((a, b) => d(b.totalBase).comparedTo(d(a.totalBase)));

  const balanceByMember = new Map(memberBalances.map((b) => [b.memberId, b]));
  const allMemberIds = new Set<string>([...memberIds, ...balanceByMember.keys()]);

  const members: MemberReportItem[] = Array.from(allMemberIds).map((memberId) => {
    const bal = balanceByMember.get(memberId);
    return {
      memberId,
      paidBase: bal?.paidBase ?? zeroMoney(),
      shareBase: bal?.shareBase ?? zeroMoney(),
      netBase: bal?.netBase ?? zeroMoney(),
      personalExpensesBase: money(personalExpenses.get(memberId) ?? 0),
      contributedBase: money(contributed.get(memberId) ?? 0),
      withdrawnBase: money(withdrawn.get(memberId) ?? 0),
      settledOutBase: money(settledOut.get(memberId) ?? 0),
      settledInBase: money(settledIn.get(memberId) ?? 0),
      pendingSettlementsOut: pendingSettlementsOut.get(memberId) ?? 0,
      pendingSettlementsIn: pendingSettlementsIn.get(memberId) ?? 0,
      pendingWithdrawalsIn: pendingWithdrawalsIn.get(memberId) ?? 0,
    };
  });

  return {
    totalExpensesBase: money(totalExpenses),
    byCategory,
    totalPersonalExpensesBase: money(totalPersonalExpenses),
    totalAssetsBase,
    members,
  };
}
