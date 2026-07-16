import { describe, expect, it } from "vitest";
import {
  addLocalParticipant,
  createExpense,
  createInvitation,
  createSettlement,
  createSplitRoom,
  getRoomSnapshot,
  joinRoom,
} from "./store";
import {
  confirmWithdrawal,
  createAsset,
  createContribution,
  createExpenseFromAsset,
  createWithdrawal,
  getLedgerSnapshot,
  getSplitReport,
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

  it("room-level balance (getRoomSnapshot) reflects cash-pot contributions, not just plain expenses", async () => {
    // Reproduces: an expense paid & split among whoever exists at that moment, a member
    // joins afterwards, then everyone contributes to a shared "касса" — the top-level
    // balance must show the money sitting in the pot, not a stale 0/0.
    const { room, owner } = await createSplitRoom({
      name: "Trip",
      ownerName: "Я",
      baseCurrency: "KZT",
    });

    await createExpense({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      description: "Билеты",
      amountOriginal: "10000000.00",
      currencyOriginal: "KZT",
      paidByMemberId: owner.memberId,
      splitMethod: "equal",
      participants: [{ memberId: owner.memberId }],
    });

    const salta = await addLocalParticipant({ roomId: room.roomId, displayName: "Салта" });

    const cash = await createAsset({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      name: "Касса",
      currency: "KZT",
      custodianMemberId: owner.memberId,
    });

    await createContribution({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      fromMemberId: owner.memberId,
      toAssetId: cash.id,
      amount: "10000.00",
    });
    await createContribution({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      fromMemberId: salta.memberId,
      toAssetId: cash.id,
      amount: "950000.00",
    });

    const snap = await getRoomSnapshot(room.roomId);
    // Bug: before computeEffectiveBalances, this would show "0.00"/"0.00" — the
    // legacy engine never saw the contributions made through the shared cash pot.
    expect(snap.balances.find((b) => b.memberId === owner.memberId)?.netBase).toBe("10000.00");
    expect(snap.balances.find((b) => b.memberId === salta.memberId)?.netBase).toBe("950000.00");
    // Both are "creditors" (unspent cash in the pot isn't yet owed by anyone) — no
    // settlement is suggested until that cash is actually spent.
    expect(snap.suggestions).toHaveLength(0);
  });

  it("settlement validation is ledger-aware for debts created through a shared asset", async () => {
    // Without ledger-aware validation, this debt is invisible to createSettlement's
    // balance check (it only ever saw plain per-member expenses), so a legitimate
    // settlement would be rejected as "exceeding" a debt that appears to be zero.
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
      name: "Касса",
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
    await createExpenseFromAsset({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      description: "Taxi",
      amountOriginal: "30.00",
      currencyOriginal: "KZT",
      assetId: cash.id,
      splitMethod: "equal",
      participants: [{ memberId: owner.memberId }, { memberId: bob.member.memberId }],
    });

    let snap = await getRoomSnapshot(room.roomId);
    expect(snap.balances.find((b) => b.memberId === owner.memberId)?.netBase).toBe("85.00");
    expect(snap.balances.find((b) => b.memberId === bob.member.memberId)?.netBase).toBe("-15.00");
    expect(snap.suggestions).toEqual([
      { fromMemberId: bob.member.memberId, toMemberId: owner.memberId, amountBase: "15.00" },
    ]);

    await createSettlement({
      roomId: room.roomId,
      actorMemberId: bob.member.memberId,
      fromMemberId: bob.member.memberId,
      toMemberId: owner.memberId,
      amountBase: "15.00",
    });

    snap = await getRoomSnapshot(room.roomId);
    expect(snap.balances.find((b) => b.memberId === owner.memberId)?.netBase).toBe("70.00");
    expect(snap.balances.find((b) => b.memberId === bob.member.memberId)?.netBase).toBe("0.00");
  });

  it("only the asset custodian (or the owner) may withdraw money from it", async () => {
    const { room, owner } = await createSplitRoom({ name: "Trip", ownerName: "Alice", baseCurrency: "KZT" });
    const invite = await createInvitation({ roomId: room.roomId, createdBy: owner.memberId });
    const bob = await joinRoom({ token: invite.token, displayName: "Bob" });

    const cash = await createAsset({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      name: "Касса",
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

    // Bob has no physical access to the cash and isn't the owner — rejected.
    await expect(
      createWithdrawal({
        roomId: room.roomId,
        actorMemberId: bob.member.memberId,
        fromAssetId: cash.id,
        toMemberId: bob.member.memberId,
        amount: "10.00",
      }),
    ).rejects.toThrow("asset_custodian_required");

    // The custodian (Alice) can withdraw for herself; auto-confirmed (she's the recipient).
    const selfWithdrawal = await createWithdrawal({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      fromAssetId: cash.id,
      toMemberId: owner.memberId,
      amount: "10.00",
    });
    expect(selfWithdrawal.status).toBe("confirmed");
  });

  it("withdrawal to a connected member stays pending until they confirm receipt", async () => {
    const { room, owner } = await createSplitRoom({ name: "Trip", ownerName: "Alice", baseCurrency: "KZT" });
    const invite = await createInvitation({ roomId: room.roomId, createdBy: owner.memberId });
    const bob = await joinRoom({ token: invite.token, displayName: "Bob" });

    const cash = await createAsset({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      name: "Касса",
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

    // Alice (custodian) hands cash to Bob — Bob, a connected member, must accept it.
    const withdrawal = await createWithdrawal({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      fromAssetId: cash.id,
      toMemberId: bob.member.memberId,
      amount: "40.00",
    });
    expect(withdrawal.status).toBe("pending");

    await expect(
      confirmWithdrawal(room.roomId, withdrawal.id, owner.memberId),
    ).rejects.toThrow("not_withdrawal_recipient");

    const confirmed = await confirmWithdrawal(room.roomId, withdrawal.id, bob.member.memberId);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmedBy).toBe(bob.member.memberId);
  });

  it("withdrawal to a local member is auto-confirmed", async () => {
    const { room, owner } = await createSplitRoom({ name: "Trip", ownerName: "Alice", baseCurrency: "KZT" });
    const kid = await addLocalParticipant({ roomId: room.roomId, displayName: "Kid" });

    const cash = await createAsset({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      name: "Касса",
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

    const withdrawal = await createWithdrawal({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      fromAssetId: cash.id,
      toMemberId: kid.memberId,
      amount: "20.00",
    });
    expect(withdrawal.status).toBe("confirmed");
    expect(withdrawal.confirmedBy).toBe(owner.memberId);
  });

  it("getSplitReport aggregates category totals, contributions, withdrawals and settlements per member", async () => {
    const { room, owner } = await createSplitRoom({ name: "Trip", ownerName: "Alice", baseCurrency: "KZT" });
    const invite = await createInvitation({ roomId: room.roomId, createdBy: owner.memberId });
    const bob = await joinRoom({ token: invite.token, displayName: "Bob" });

    await createExpense({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      description: "Dinner",
      amountOriginal: "40.00",
      currencyOriginal: "KZT",
      categoryId: "food",
      paidByMemberId: owner.memberId,
      splitMethod: "equal",
      participants: [{ memberId: owner.memberId }, { memberId: bob.member.memberId }],
    });

    const cash = await createAsset({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      name: "Касса",
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
    await createExpenseFromAsset({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      description: "Museum",
      amountOriginal: "20.00",
      currencyOriginal: "KZT",
      categoryId: "fun",
      assetId: cash.id,
      splitMethod: "equal",
      participants: [{ memberId: owner.memberId }, { memberId: bob.member.memberId }],
    });
    // Pending: Bob, a connected member, hasn't confirmed receipt yet.
    await createWithdrawal({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      fromAssetId: cash.id,
      toMemberId: bob.member.memberId,
      amount: "10.00",
    });
    // Pending: recorded by Bob (fromMemberId), Alice (toMemberId) hasn't confirmed yet.
    await createSettlement({
      roomId: room.roomId,
      actorMemberId: bob.member.memberId,
      fromMemberId: bob.member.memberId,
      toMemberId: owner.memberId,
      amountBase: "5.00",
    });

    const report = await getSplitReport(room.roomId);
    expect(report.totalExpensesBase).toBe("60.00");
    expect(report.byCategory).toEqual(
      expect.arrayContaining([
        { categoryId: "food", totalBase: "40.00" },
        { categoryId: "fun", totalBase: "20.00" },
      ]),
    );
    expect(report.totalAssetsBase).toBe("70.00");

    const aliceReport = report.members.find((m) => m.memberId === owner.memberId)!;
    const bobReport = report.members.find((m) => m.memberId === bob.member.memberId)!;
    expect(aliceReport.contributedBase).toBe("100.00");
    expect(bobReport.withdrawnBase).toBe("10.00");
    expect(bobReport.pendingWithdrawalsIn).toBe(1);
    expect(bobReport.pendingSettlementsOut).toBe(1);
    expect(aliceReport.pendingSettlementsIn).toBe(1);
    expect(aliceReport.settledInBase).toBe("0.00");
  });
});
