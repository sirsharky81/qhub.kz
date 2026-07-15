import { describe, expect, it } from "vitest";
import { computeBalances } from "../engine/balance";
import { money, eqMoney } from "../decimal";
import { SplitValidationError } from "../engine/shares";
import { foldLedger, identityFx, operationsFromLegacy } from "./index";
import type { RoomAsset, SplitOperation } from "./types";
import type { DebtSettlement, SplitExpense } from "../types";

function asset(partial: Partial<RoomAsset> & Pick<RoomAsset, "id" | "custodianMemberId">): RoomAsset {
  return {
    roomId: "R1",
    name: "Касса",
    kind: "cash",
    currency: "KZT",
    createdAt: 1,
    ...partial,
  };
}

describe("ledger fold — v3.3 regression", () => {
  it("matches computeBalances for personal expense + settlement", () => {
    const expenses: SplitExpense[] = [
      {
        id: "e1",
        roomId: "R1",
        description: "Dinner",
        amountOriginal: "90.00",
        currencyOriginal: "KZT",
        exchangeRate: "1",
        exchangeTimestamp: 1,
        amountBase: "90.00",
        categoryId: "food",
        paidByMemberId: "a",
        splitMethod: "equal",
        participantIds: ["a", "b", "c"],
        participants: [
          { memberId: "a", inputValue: null, amountBase: "30.00" },
          { memberId: "b", inputValue: null, amountBase: "30.00" },
          { memberId: "c", inputValue: null, amountBase: "30.00" },
        ],
        locked: false,
        createdBy: "a",
        createdAt: 10,
        updatedAt: 10,
        version: 1,
      },
    ];
    const settlements: DebtSettlement[] = [
      {
        id: "s1",
        roomId: "R1",
        fromMemberId: "b",
        toMemberId: "a",
        amountBase: "30.00",
        date: "2026-07-15",
        createdBy: "b",
        createdAt: 20,
      },
    ];

    const legacy = computeBalances(["a", "b", "c"], expenses, settlements);
    const snap = foldLedger({
      memberIds: ["a", "b", "c"],
      assets: [],
      operations: operationsFromLegacy({ expenses, settlements }),
      fx: identityFx("KZT"),
      baseCurrency: "KZT",
    });

    expect(snap.sumAssetBalancesBase).toBe("0.00");
    expect(snap.sumMemberNetsBase).toBe("0.00");
    for (const b of legacy) {
      const m = snap.members.find((x) => x.memberId === b.memberId);
      expect(m?.netBase).toBe(b.netBase);
      expect(m?.paidBase).toBe(b.paidBase);
      expect(m?.shareBase).toBe(b.shareBase);
    }
  });
});

describe("ledger fold — assets + custodian", () => {
  it("contribution increases asset and contributor net", () => {
    const ops: SplitOperation[] = [
      {
        id: "c1",
        roomId: "R1",
        type: "contribution",
        createdAt: 1,
        createdBy: "a",
        fromMemberId: "a",
        toAssetId: "cash1",
        amount: "100000.00",
        currency: "KZT",
        amountBase: "100000.00",
      },
    ];
    const snap = foldLedger({
      memberIds: ["a", "b"],
      assets: [asset({ id: "cash1", custodianMemberId: "a", name: "Касса у Бориса" })],
      operations: ops,
      fx: identityFx("KZT"),
      baseCurrency: "KZT",
    });
    expect(snap.assets[0]?.balanceNative).toBe("100000.00");
    expect(snap.assets[0]?.custodianMemberId).toBe("a");
    expect(snap.members.find((m) => m.memberId === "a")?.netBase).toBe("100000.00");
    expect(eqMoney(snap.sumMemberNetsBase, snap.sumAssetBalancesBase)).toBe(true);
    expect(snap.advancedSuggested).toBe(true);
  });

  it("expense from cash reduces asset and allocates shares", () => {
    const ops: SplitOperation[] = [
      {
        id: "c1",
        roomId: "R1",
        type: "contribution",
        createdAt: 1,
        createdBy: "a",
        fromMemberId: "a",
        toAssetId: "cash1",
        amount: "100.00",
        currency: "KZT",
        amountBase: "100.00",
      },
      {
        id: "e1",
        roomId: "R1",
        type: "expense",
        createdAt: 2,
        createdBy: "a",
        description: "Taxi",
        amountOriginal: "30.00",
        currencyOriginal: "KZT",
        exchangeRate: "1",
        amountBase: "30.00",
        categoryId: "transport",
        paymentSource: { kind: "asset", assetId: "cash1" },
        splitMethod: "equal",
        participants: [
          { memberId: "a", inputValue: null, amountBase: "15.00" },
          { memberId: "b", inputValue: null, amountBase: "15.00" },
        ],
      },
    ];
    const snap = foldLedger({
      memberIds: ["a", "b"],
      assets: [asset({ id: "cash1", custodianMemberId: "a" })],
      operations: ops,
      fx: identityFx("KZT"),
      baseCurrency: "KZT",
    });
    expect(snap.assets[0]?.balanceNative).toBe("70.00");
    expect(snap.members.find((m) => m.memberId === "a")?.netBase).toBe("85.00"); // 100 - 15
    expect(snap.members.find((m) => m.memberId === "b")?.netBase).toBe("-15.00");
    expect(snap.sumMemberNetsBase).toBe("70.00");
    expect(snap.sumAssetBalancesBase).toBe("70.00");
  });

  it("rejects negative asset balance", () => {
    const ops: SplitOperation[] = [
      {
        id: "e1",
        roomId: "R1",
        type: "expense",
        createdAt: 1,
        createdBy: "a",
        description: "Overdraft",
        amountOriginal: "10.00",
        currencyOriginal: "KZT",
        exchangeRate: "1",
        amountBase: "10.00",
        categoryId: "other",
        paymentSource: { kind: "asset", assetId: "cash1" },
        splitMethod: "equal",
        participants: [{ memberId: "a", inputValue: null, amountBase: "10.00" }],
      },
    ];
    expect(() =>
      foldLedger({
        memberIds: ["a"],
        assets: [asset({ id: "cash1", custodianMemberId: "a" })],
        operations: ops,
        fx: identityFx("KZT"),
        baseCurrency: "KZT",
      }),
    ).toThrow(SplitValidationError);
  });

  it("withdrawal and custody handoff", () => {
    const ops: SplitOperation[] = [
      {
        id: "c1",
        roomId: "R1",
        type: "contribution",
        createdAt: 1,
        createdBy: "a",
        fromMemberId: "a",
        toAssetId: "cash1",
        amount: "50.00",
        currency: "KZT",
        amountBase: "50.00",
      },
      {
        id: "w1",
        roomId: "R1",
        type: "withdrawal",
        createdAt: 2,
        createdBy: "a",
        fromAssetId: "cash1",
        toMemberId: "a",
        amount: "10.00",
        currency: "KZT",
        amountBase: "10.00",
      },
      {
        id: "h1",
        roomId: "R1",
        type: "custody_handoff",
        createdAt: 3,
        createdBy: "a",
        assetId: "cash1",
        toCustodianMemberId: "b",
      },
    ];
    const snap = foldLedger({
      memberIds: ["a", "b"],
      assets: [asset({ id: "cash1", custodianMemberId: "a" })],
      operations: ops,
      fx: identityFx("KZT"),
      baseCurrency: "KZT",
    });
    expect(snap.assets[0]?.balanceNative).toBe("40.00");
    expect(snap.assets[0]?.custodianMemberId).toBe("b");
    expect(snap.members.find((m) => m.memberId === "a")?.netBase).toBe("40.00");
    expect(snap.sumMemberNetsBase).toBe(money(40));
  });

  it("transfer and exchange do not change member nets sum beyond assets", () => {
    const ops: SplitOperation[] = [
      {
        id: "c1",
        roomId: "R1",
        type: "contribution",
        createdAt: 1,
        createdBy: "a",
        fromMemberId: "a",
        toAssetId: "kzt",
        amount: "100.00",
        currency: "KZT",
        amountBase: "100.00",
      },
      {
        id: "t1",
        roomId: "R1",
        type: "transfer",
        createdAt: 2,
        createdBy: "a",
        fromAssetId: "kzt",
        toAssetId: "kzt2",
        amount: "40.00",
        currency: "KZT",
      },
    ];
    const snap = foldLedger({
      memberIds: ["a"],
      assets: [
        asset({ id: "kzt", custodianMemberId: "a", name: "Касса A" }),
        asset({ id: "kzt2", custodianMemberId: "b", name: "Касса B" }),
      ],
      operations: ops,
      fx: identityFx("KZT"),
      baseCurrency: "KZT",
    });
    expect(snap.members.find((m) => m.memberId === "a")?.netBase).toBe("100.00");
    expect(snap.assets.find((a) => a.assetId === "kzt")?.balanceNative).toBe("60.00");
    expect(snap.assets.find((a) => a.assetId === "kzt2")?.balanceNative).toBe("40.00");
    expect(snap.sumAssetBalancesBase).toBe("100.00");
  });
});
