import { describe, expect, it } from "vitest";
import {
  addLocalParticipant,
  confirmSettlement,
  createExpense,
  createInvitation,
  createSettlement,
  createSplitRoom,
  createWhitelistedSession,
  getRoomSnapshot,
  joinRoom,
  transferOwnership,
  addDeviceToWhitelist,
  verifyMemberToken,
} from "./store";

describe("split store flow", () => {
  it("creates room, joins, expenses, settlements", async () => {
    const { room, owner, accessToken } = await createSplitRoom({
      name: "Trip",
      ownerName: "Alice",
      baseCurrency: "KZT",
    });
    expect(accessToken).toBeTruthy();
    expect(owner.status).toBe("connected");

    const invite = await createInvitation({ roomId: room.roomId, createdBy: owner.memberId });
    const bob = await joinRoom({ token: invite.token, displayName: "Bob" });
    expect(bob.member.status).toBe("connected");

    await createExpense({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      description: "Dinner",
      amountOriginal: "90.00",
      currencyOriginal: "KZT",
      paidByMemberId: owner.memberId,
      splitMethod: "equal",
      participants: [{ memberId: owner.memberId }, { memberId: bob.member.memberId }],
    });

    let snap = await getRoomSnapshot(room.roomId);
    expect(snap.balances.find((b) => b.memberId === owner.memberId)?.netBase).toBe("45.00");
    expect(snap.suggestions).toHaveLength(1);

    const suggestion = snap.suggestions[0]!;
    await createSettlement({
      roomId: room.roomId,
      actorMemberId: bob.member.memberId,
      fromMemberId: suggestion.fromMemberId,
      toMemberId: suggestion.toMemberId,
      amountBase: suggestion.amountBase,
    });

    snap = await getRoomSnapshot(room.roomId);
    expect(snap.expensesLocked).toBe(true);
    expect(snap.expenses.every((e) => e.locked)).toBe(true);
    expect(snap.balances.every((b) => b.netBase === "0.00")).toBe(true);
  });

  it("local participant → expense → seat invite claim keeps memberId", async () => {
    const { room, owner } = await createSplitRoom({
      name: "Family",
      ownerName: "Boris",
      baseCurrency: "KZT",
    });

    const alina = await addLocalParticipant({
      roomId: room.roomId,
      displayName: "Alina",
    });
    expect(alina.status).toBe("local");
    expect(alina.tokenHash).toBeFalsy();

    await createExpense({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      description: "Taxi",
      amountOriginal: "100.00",
      currencyOriginal: "KZT",
      paidByMemberId: alina.memberId,
      splitMethod: "equal",
      participants: [{ memberId: owner.memberId }, { memberId: alina.memberId }],
    });

    let snap = await getRoomSnapshot(room.roomId);
    expect(snap.members.find((m) => m.memberId === alina.memberId)?.status).toBe("local");
    expect(snap.balances.find((b) => b.memberId === alina.memberId)?.netBase).toBe("50.00");

    const seatInvite = await createInvitation({
      roomId: room.roomId,
      createdBy: owner.memberId,
      seatMemberId: alina.memberId,
    });
    expect(seatInvite.seatMemberId).toBe(alina.memberId);

    snap = await getRoomSnapshot(room.roomId);
    expect(snap.members.find((m) => m.memberId === alina.memberId)?.status).toBe("pending_invite");

    const claimed = await joinRoom({
      token: seatInvite.token,
      displayName: "Alina K",
      deviceKey: "device-alina-phone",
    });
    expect(claimed.member.memberId).toBe(alina.memberId);
    expect(claimed.member.status).toBe("connected");
    expect(claimed.member.displayName).toBe("Alina K");

    snap = await getRoomSnapshot(room.roomId);
    expect(snap.members.find((m) => m.memberId === alina.memberId)?.status).toBe("connected");
    // History preserved on same id
    expect(snap.balances.find((b) => b.memberId === alina.memberId)?.netBase).toBe("50.00");

    // Seat invite is one-shot
    await expect(
      joinRoom({ token: seatInvite.token, displayName: "X", deviceKey: "other" }),
    ).rejects.toThrow("invite_consumed");

    // Second device without whitelist
    const reinvite = await createInvitation({
      roomId: room.roomId,
      createdBy: owner.memberId,
      seatMemberId: alina.memberId,
    }).catch((e: Error) => e);
    expect(reinvite).toBeInstanceOf(Error);
    expect((reinvite as Error).message).toBe("already_connected");

    await addDeviceToWhitelist({
      roomId: room.roomId,
      memberId: alina.memberId,
      deviceKey: "device-alina-tablet",
    });
    const second = await createWhitelistedSession({
      roomId: room.roomId,
      memberId: alina.memberId,
      deviceKey: "device-alina-tablet",
    });
    expect(second.accessToken).toBeTruthy();
    expect(await verifyMemberToken(alina.memberId, second.accessToken)).toBeTruthy();

    await expect(
      createWhitelistedSession({
        roomId: room.roomId,
        memberId: alina.memberId,
        deviceKey: "unknown-device",
      }),
    ).rejects.toThrow("device_not_whitelisted");
  });

  it("settlement to a connected recipient is pending until they confirm receipt", async () => {
    const { room, owner } = await createSplitRoom({ ownerName: "Alice", baseCurrency: "KZT" });
    const invite = await createInvitation({ roomId: room.roomId, createdBy: owner.memberId });
    const bob = await joinRoom({ token: invite.token, displayName: "Bob" });

    await createExpense({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      description: "Dinner",
      amountOriginal: "20.00",
      currencyOriginal: "KZT",
      paidByMemberId: owner.memberId,
      splitMethod: "equal",
      participants: [{ memberId: owner.memberId }, { memberId: bob.member.memberId }],
    });

    // Bob (debtor) reports he paid Alice back — Alice, a connected member, hasn't
    // acknowledged it yet, so the record starts out "pending".
    const settlement = await createSettlement({
      roomId: room.roomId,
      actorMemberId: bob.member.memberId,
      fromMemberId: bob.member.memberId,
      toMemberId: owner.memberId,
      amountBase: "10.00",
    });
    expect(settlement.status).toBe("pending");
    expect(settlement.confirmedBy).toBeFalsy();

    // Only the recipient (Alice) may confirm — Bob confirming his own payment is rejected.
    await expect(
      confirmSettlement(room.roomId, settlement.id, bob.member.memberId),
    ).rejects.toThrow("not_settlement_recipient");

    const confirmed = await confirmSettlement(room.roomId, settlement.id, owner.memberId);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmedBy).toBe(owner.memberId);
    expect(confirmed.confirmedAt).toBeTruthy();

    // Idempotent: confirming an already-confirmed settlement is a no-op, not an error.
    const again = await confirmSettlement(room.roomId, settlement.id, owner.memberId);
    expect(again.status).toBe("confirmed");
  });

  it("settlement to a local recipient is auto-confirmed (they can never confirm themselves)", async () => {
    const { room, owner } = await createSplitRoom({ ownerName: "Boris", baseCurrency: "KZT" });
    const kid = await addLocalParticipant({ roomId: room.roomId, displayName: "Kid" });

    await createExpense({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      description: "Toys",
      amountOriginal: "10.00",
      currencyOriginal: "KZT",
      paidByMemberId: kid.memberId,
      splitMethod: "equal",
      participants: [{ memberId: owner.memberId }, { memberId: kid.memberId }],
    });

    const settlement = await createSettlement({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      fromMemberId: owner.memberId,
      toMemberId: kid.memberId,
      amountBase: "5.00",
    });
    expect(settlement.status).toBe("confirmed");
    expect(settlement.confirmedBy).toBe(owner.memberId);
  });

  it("settlement where the recipient reports it themselves is auto-confirmed", async () => {
    const { room, owner } = await createSplitRoom({ ownerName: "Alice", baseCurrency: "KZT" });
    const invite = await createInvitation({ roomId: room.roomId, createdBy: owner.memberId });
    const bob = await joinRoom({ token: invite.token, displayName: "Bob" });

    await createExpense({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      description: "Dinner",
      amountOriginal: "10.00",
      currencyOriginal: "KZT",
      paidByMemberId: owner.memberId,
      splitMethod: "equal",
      participants: [{ memberId: owner.memberId }, { memberId: bob.member.memberId }],
    });

    // Alice (the creditor / recipient) records that Bob paid her — she's confirming
    // in the same action, no separate accept needed.
    const settlement = await createSettlement({
      roomId: room.roomId,
      actorMemberId: owner.memberId,
      fromMemberId: bob.member.memberId,
      toMemberId: owner.memberId,
      amountBase: "5.00",
    });
    expect(settlement.status).toBe("confirmed");
    expect(settlement.confirmedBy).toBe(owner.memberId);
  });

  it("can transfer ownership to a local participant", async () => {
    const { room, owner } = await createSplitRoom({ ownerName: "Boris", baseCurrency: "KZT" });
    const kid = await addLocalParticipant({ roomId: room.roomId, displayName: "Kid" });
    const updated = await transferOwnership({ roomId: room.roomId, toMemberId: kid.memberId });
    expect(updated.ownerMemberId).toBe(kid.memberId);
    const snap = await getRoomSnapshot(room.roomId);
    expect(snap.members.find((m) => m.memberId === kid.memberId)?.role).toBe("owner");
    expect(snap.members.find((m) => m.memberId === owner.memberId)?.role).toBe("member");
  });
});
