import { describe, expect, it } from "vitest";
import { createSplitRoom, joinRoom, createInvitation, createExpense } from "./store";
import {
  createAsset,
  createContribution,
  createExpenseFromAsset,
  getLedgerSnapshot,
} from "./ledger-store";

describe("ledger-store persistence", () => {
  it("creates asset, contribution, expense from cash and keeps invariant", async () => {
    const { room, owner } = await createSplitRoom({
      name: "Trip",
      ownerName: "Alice",
      baseCurrency: "KZT",
    });
    const invite = await createInvitation({ roomId: room.roomId, createdBy: owner.memberId });
    const bob = await joinRoom({ token: invite.token, displayName: "Bob" });

    const cash = await createAsset({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      name: "Касса Алисы",
      currency: "KZT",
      custodianMemberId: owner.memberId,
    });

    await createContribution({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      fromMemberId: owner.memberId,
      toAssetId: cash.id,
      amount: "100.00",
    });

    await createExpense({
      roomId: room.roomId,
      actorMemberId: bob.member.memberId,
      description: "Personal",
      amountOriginal: "20.00",
      currencyOriginal: "KZT",
      paidByMemberId: bob.member.memberId,
      splitMethod: "equal",
      participants: [{ memberId: owner.memberId }, { memberId: bob.member.memberId }],
    });

    await createExpenseFromAsset({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      description: "Taxi from pot",
      amountOriginal: "30.00",
      currencyOriginal: "KZT",
      assetId: cash.id,
      splitMethod: "equal",
      participants: [{ memberId: owner.memberId }, { memberId: bob.member.memberId }],
    });

    const { ledger, room: room2 } = await getLedgerSnapshot(room.roomId);
    expect(room2.advancedAccounting).toBe(true);
    expect(ledger.assets.find((a) => a.assetId === cash.id)?.balanceNative).toBe("70.00");
    expect(ledger.sumMemberNetsBase).toBe(ledger.sumAssetBalancesBase);
    expect(ledger.sumAssetBalancesBase).toBe("70.00");
  });
});
