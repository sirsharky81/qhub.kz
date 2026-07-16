import { describe, expect, it } from "vitest";
import { computeSplitReport } from "./report";
import type { SplitOperation } from "./ledger";

describe("computeSplitReport", () => {
  it("aggregates category totals, contributions, withdrawals and settlement acceptance state", () => {
    const operations: SplitOperation[] = [
      {
        id: "e1",
        roomId: "R1",
        type: "expense",
        createdAt: 1,
        createdBy: "a",
        locked: false,
        description: "Dinner",
        amountOriginal: "40.00",
        currencyOriginal: "KZT",
        exchangeRate: "1",
        amountBase: "40.00",
        categoryId: "food",
        paymentSource: { kind: "member", memberId: "a" },
        splitMethod: "equal",
        participants: [
          { memberId: "a", inputValue: null, amountBase: "20.00" },
          { memberId: "b", inputValue: null, amountBase: "20.00" },
        ],
      },
      {
        id: "e2",
        roomId: "R1",
        type: "expense",
        createdAt: 2,
        createdBy: "a",
        locked: false,
        description: "Museum",
        amountOriginal: "20.00",
        currencyOriginal: "KZT",
        exchangeRate: "1",
        amountBase: "20.00",
        categoryId: "fun",
        paymentSource: { kind: "asset", assetId: "cash1" },
        splitMethod: "equal",
        participants: [
          { memberId: "a", inputValue: null, amountBase: "10.00" },
          { memberId: "b", inputValue: null, amountBase: "10.00" },
        ],
      },
      {
        id: "c1",
        roomId: "R1",
        type: "contribution",
        createdAt: 3,
        createdBy: "a",
        fromMemberId: "a",
        toAssetId: "cash1",
        amount: "100.00",
        currency: "KZT",
        amountBase: "100.00",
      },
      {
        id: "w1",
        roomId: "R1",
        type: "withdrawal",
        createdAt: 4,
        createdBy: "a",
        fromAssetId: "cash1",
        toMemberId: "b",
        amount: "10.00",
        currency: "KZT",
        amountBase: "10.00",
        status: "pending",
      },
      {
        id: "s1",
        roomId: "R1",
        type: "settlement",
        createdAt: 5,
        createdBy: "b",
        fromMemberId: "b",
        toMemberId: "a",
        amountBase: "5.00",
        status: "confirmed",
        confirmedBy: "a",
        confirmedAt: 6,
      },
      {
        id: "s2",
        roomId: "R1",
        type: "settlement",
        createdAt: 7,
        createdBy: "b",
        fromMemberId: "b",
        toMemberId: "a",
        amountBase: "3.00",
        status: "pending",
      },
    ];

    const report = computeSplitReport({
      memberIds: ["a", "b"],
      operations,
      memberBalances: [
        { memberId: "a", paidBase: "140.00", shareBase: "30.00", netBase: "110.00" },
        { memberId: "b", paidBase: "0.00", shareBase: "40.00", netBase: "-40.00" },
      ],
      totalAssetsBase: "70.00",
    });

    expect(report.totalExpensesBase).toBe("60.00");
    expect(report.byCategory).toEqual([
      { categoryId: "food", totalBase: "40.00" },
      { categoryId: "fun", totalBase: "20.00" },
    ]);
    expect(report.totalAssetsBase).toBe("70.00");

    const a = report.members.find((m) => m.memberId === "a")!;
    const b = report.members.find((m) => m.memberId === "b")!;

    expect(a.paidBase).toBe("140.00");
    expect(a.netBase).toBe("110.00");
    expect(a.contributedBase).toBe("100.00");
    expect(a.settledInBase).toBe("5.00");
    expect(a.pendingSettlementsIn).toBe(1);

    expect(b.withdrawnBase).toBe("10.00");
    expect(b.pendingWithdrawalsIn).toBe(1);
    expect(b.settledOutBase).toBe("5.00");
    expect(b.pendingSettlementsOut).toBe(1);
  });

  it("excludes personal expenses from shared totals but tracks them per payer", () => {
    const operations: SplitOperation[] = [
      {
        id: "e1",
        roomId: "R1",
        type: "expense",
        createdAt: 1,
        createdBy: "a",
        locked: false,
        description: "Dinner",
        amountOriginal: "40.00",
        currencyOriginal: "KZT",
        exchangeRate: "1",
        amountBase: "40.00",
        categoryId: "food",
        paymentSource: { kind: "member", memberId: "a" },
        splitMethod: "equal",
        participants: [
          { memberId: "a", inputValue: null, amountBase: "20.00" },
          { memberId: "b", inputValue: null, amountBase: "20.00" },
        ],
      },
      {
        id: "e2",
        roomId: "R1",
        type: "expense",
        createdAt: 2,
        createdBy: "b",
        locked: false,
        description: "Hotel — my own",
        amountOriginal: "50.00",
        currencyOriginal: "KZT",
        exchangeRate: "1",
        amountBase: "50.00",
        categoryId: "hotel",
        paymentSource: { kind: "member", memberId: "b" },
        splitMethod: "equal",
        participants: [{ memberId: "b", inputValue: null, amountBase: "50.00" }],
        personal: true,
      },
    ];

    const report = computeSplitReport({
      memberIds: ["a", "b"],
      operations,
      memberBalances: [
        { memberId: "a", paidBase: "40.00", shareBase: "20.00", netBase: "20.00" },
        { memberId: "b", paidBase: "50.00", shareBase: "70.00", netBase: "-20.00" },
      ],
      totalAssetsBase: "0.00",
    });

    expect(report.totalExpensesBase).toBe("40.00");
    expect(report.byCategory).toEqual([{ categoryId: "food", totalBase: "40.00" }]);
    expect(report.totalPersonalExpensesBase).toBe("50.00");

    const b = report.members.find((m) => m.memberId === "b")!;
    expect(b.personalExpensesBase).toBe("50.00");
    const a = report.members.find((m) => m.memberId === "a")!;
    expect(a.personalExpensesBase).toBe("0.00");
  });

  it("includes members with no balance record and defaults their numbers to zero", () => {
    const report = computeSplitReport({
      memberIds: ["a", "b", "c"],
      operations: [],
      memberBalances: [{ memberId: "a", paidBase: "0.00", shareBase: "0.00", netBase: "0.00" }],
      totalAssetsBase: "0.00",
    });
    const c = report.members.find((m) => m.memberId === "c")!;
    expect(c.paidBase).toBe("0.00");
    expect(c.contributedBase).toBe("0.00");
    expect(c.pendingSettlementsIn).toBe(0);
  });
});
