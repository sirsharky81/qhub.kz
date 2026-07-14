import { describe, expect, it } from "vitest";
import {
  createExpense,
  createInvitation,
  createSettlement,
  createSplitRoom,
  getRoomSnapshot,
  joinRoom,
} from "./store";

describe("split store flow", () => {
  it("creates room, joins, expenses, settlements", async () => {
    const { room, owner, accessToken } = await createSplitRoom({
      name: "Trip",
      ownerName: "Alice",
      baseCurrency: "KZT",
    });
    expect(accessToken).toBeTruthy();

    const invite = await createInvitation({ roomId: room.roomId, createdBy: owner.memberId });
    const bob = await joinRoom({ token: invite.token, displayName: "Bob" });

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
});
