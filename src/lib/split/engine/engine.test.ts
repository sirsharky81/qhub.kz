import { describe, expect, it } from "vitest";
import { allocateLargestRemainder, eqMoney, money, sumMoney } from "../decimal";
import {
  assertSettlementAllowed,
  canLeaveRoom,
  computeAmountBase,
  computeBalances,
  normalizeShares,
  SplitValidationError,
  suggestSettlements,
  areExpensesLocked,
  areBalancesSettled,
} from "./index";
import type { DebtSettlement, SplitExpense } from "../types";

function expense(partial: Partial<SplitExpense> & Pick<SplitExpense, "id" | "paidByMemberId" | "participants" | "amountBase">): SplitExpense {
  return {
    roomId: "ROOM1",
    description: "test",
    amountOriginal: partial.amountBase,
    currencyOriginal: "KZT",
    exchangeRate: "1",
    exchangeTimestamp: 1,
    categoryId: "food",
    splitMethod: "equal",
    participantIds: partial.participants.map((p) => p.memberId),
    comment: null,
    geo: null,
    locked: false,
    createdBy: "m1",
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    ...partial,
  };
}

describe("allocateLargestRemainder", () => {
  it("splits 100 into 3 equal parts", () => {
    const parts = allocateLargestRemainder("100.00", ["1", "1", "1"]);
    expect(sumMoney(parts)).toBe("100.00");
    expect(parts.sort()).toEqual(["33.33", "33.33", "33.34"].sort());
  });
});

describe("normalizeShares", () => {
  it("equal among selected participants", () => {
    const shares = normalizeShares({
      amountOriginal: "90.00",
      amountBase: "90.00",
      splitMethod: "equal",
      participants: [{ memberId: "a" }, { memberId: "b" }, { memberId: "c" }],
    });
    expect(sumMoney(shares.map((s) => s.amountBase))).toBe("90.00");
    expect(shares.every((s) => s.amountBase === "30.00")).toBe(true);
  });

  it("fixed amounts must sum to original", () => {
    const shares = normalizeShares({
      amountOriginal: "100.00",
      amountBase: "500.00",
      splitMethod: "fixed",
      participants: [
        { memberId: "a", inputValue: "40.00" },
        { memberId: "b", inputValue: "60.00" },
      ],
    });
    expect(sumMoney(shares.map((s) => s.amountBase))).toBe("500.00");
  });

  it("rejects fixed mismatch", () => {
    expect(() =>
      normalizeShares({
        amountOriginal: "100.00",
        amountBase: "100.00",
        splitMethod: "fixed",
        participants: [
          { memberId: "a", inputValue: "40.00" },
          { memberId: "b", inputValue: "50.00" },
        ],
      }),
    ).toThrow(SplitValidationError);
  });

  it("percentage must sum to 100", () => {
    const shares = normalizeShares({
      amountOriginal: "200.00",
      amountBase: "200.00",
      splitMethod: "percentage",
      participants: [
        { memberId: "a", inputValue: "25.00" },
        { memberId: "b", inputValue: "75.00" },
      ],
    });
    expect(shares.find((s) => s.memberId === "a")?.amountBase).toBe("50.00");
    expect(shares.find((s) => s.memberId === "b")?.amountBase).toBe("150.00");
  });

  it("shares by parts", () => {
    const shares = normalizeShares({
      amountOriginal: "90.00",
      amountBase: "90.00",
      splitMethod: "shares",
      participants: [
        { memberId: "a", inputValue: "1" },
        { memberId: "b", inputValue: "2" },
      ],
    });
    expect(shares.find((s) => s.memberId === "a")?.amountBase).toBe("30.00");
    expect(shares.find((s) => s.memberId === "b")?.amountBase).toBe("60.00");
  });

  it("exclude payer = participants without payer", () => {
    const shares = normalizeShares({
      amountOriginal: "100.00",
      amountBase: "100.00",
      splitMethod: "equal",
      participants: [{ memberId: "b" }, { memberId: "c" }],
    });
    expect(shares.map((s) => s.memberId).sort()).toEqual(["b", "c"]);
    expect(sumMoney(shares.map((s) => s.amountBase))).toBe("100.00");
  });
});

describe("FX and balances", () => {
  it("locks FX into amountBase", () => {
    expect(computeAmountBase("10.00", "450.00")).toBe("4500.00");
  });

  it("balance = paid - share and sums to zero", () => {
    const expenses = [
      expense({
        id: "e1",
        paidByMemberId: "a",
        amountBase: "90.00",
        participants: [
          { memberId: "a", inputValue: null, amountBase: "30.00" },
          { memberId: "b", inputValue: null, amountBase: "30.00" },
          { memberId: "c", inputValue: null, amountBase: "30.00" },
        ],
      }),
    ];
    const balances = computeBalances(["a", "b", "c"], expenses, []);
    expect(balances.find((b) => b.memberId === "a")?.netBase).toBe("60.00");
    expect(balances.find((b) => b.memberId === "b")?.netBase).toBe("-30.00");
    expect(balances.find((b) => b.memberId === "c")?.netBase).toBe("-30.00");
  });

  it("settlement reduces debts", () => {
    const expenses = [
      expense({
        id: "e1",
        paidByMemberId: "a",
        amountBase: "100.00",
        participants: [
          { memberId: "a", inputValue: null, amountBase: "50.00" },
          { memberId: "b", inputValue: null, amountBase: "50.00" },
        ],
      }),
    ];
    const settlements: DebtSettlement[] = [
      {
        id: "s1",
        roomId: "ROOM1",
        fromMemberId: "b",
        toMemberId: "a",
        amountBase: "50.00",
        date: "2026-07-14",
        createdBy: "b",
        createdAt: 1,
        status: "confirmed",
      },
    ];
    const balances = computeBalances(["a", "b"], expenses, settlements);
    expect(areBalancesSettled(balances)).toBe(true);
    expect(areExpensesLocked(settlements)).toBe(true);
  });

  it("rejects settlement exceeding debt", () => {
    const expenses = [
      expense({
        id: "e1",
        paidByMemberId: "a",
        amountBase: "40.00",
        participants: [
          { memberId: "a", inputValue: null, amountBase: "20.00" },
          { memberId: "b", inputValue: null, amountBase: "20.00" },
        ],
      }),
    ];
    const balances = computeBalances(["a", "b"], expenses, []);
    expect(() => assertSettlementAllowed(balances, "b", "a", "21.00")).toThrow(SplitValidationError);
    expect(() => assertSettlementAllowed(balances, "b", "a", "20.00")).not.toThrow();
  });

  it("cannot leave with nonzero balance", () => {
    const expenses = [
      expense({
        id: "e1",
        paidByMemberId: "a",
        amountBase: "10.00",
        participants: [
          { memberId: "a", inputValue: null, amountBase: "5.00" },
          { memberId: "b", inputValue: null, amountBase: "5.00" },
        ],
      }),
    ];
    const balances = computeBalances(["a", "b"], expenses, []);
    expect(canLeaveRoom(balances, "b")).toBe(false);
    expect(canLeaveRoom(balances, "a")).toBe(false);
  });
});

describe("suggestSettlements greedy", () => {
  it("builds recommended payments", () => {
    const expenses = [
      expense({
        id: "e1",
        paidByMemberId: "a",
        amountBase: "90.00",
        participants: [
          { memberId: "a", inputValue: null, amountBase: "30.00" },
          { memberId: "b", inputValue: null, amountBase: "30.00" },
          { memberId: "c", inputValue: null, amountBase: "30.00" },
        ],
      }),
    ];
    const balances = computeBalances(["a", "b", "c"], expenses, []);
    const suggestions = suggestSettlements(balances);
    expect(suggestions).toHaveLength(2);
    expect(sumMoney(suggestions.map((s) => s.amountBase))).toBe("60.00");
    expect(suggestions.every((s) => s.toMemberId === "a")).toBe(true);
    const after: DebtSettlement[] = suggestions.map((s, i) => ({
      id: `s${i}`,
      roomId: "ROOM1",
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amountBase: s.amountBase,
      date: "2026-07-14",
      createdBy: s.fromMemberId,
      createdAt: i,
      status: "confirmed",
    }));
    expect(areBalancesSettled(computeBalances(["a", "b", "c"], expenses, after))).toBe(true);
  });
});

describe("money helpers", () => {
  it("never uses float equality traps", () => {
    expect(eqMoney(money(0.1 + 0.2), "0.30")).toBe(true);
  });
});
