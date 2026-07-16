import { describe, expect, it } from "vitest";
import {
  buildFamilyWeightedParticipants,
  createFamily,
  deleteFamily,
  familyWeight,
  listFamilies,
  updateFamily,
} from "./family-store";
import { addLocalParticipant, createInvitation, createSplitRoom, getRoom, joinRoom } from "./store";

async function setupTripWithTwoFamilies() {
  const { room: initialRoom, owner } = await createSplitRoom({
    name: "Trip",
    ownerName: "Ivanov Dad",
    baseCurrency: "KZT",
    roomType: "multi_family",
  });
  const invite = await createInvitation({ roomId: initialRoom.roomId, createdBy: owner.memberId });
  const mom = await joinRoom({ token: invite.token, displayName: "Ivanov Mom" });
  const otherDad = await addLocalParticipant({ roomId: initialRoom.roomId, displayName: "Petrov Dad" });
  const otherMom = await addLocalParticipant({ roomId: initialRoom.roomId, displayName: "Petrov Mom" });
  const friend = await addLocalParticipant({ roomId: initialRoom.roomId, displayName: "Solo Friend" });

  // createSplitRoom/joinRoom/addLocalParticipant each return the room as it was
  // *at that point* — refetch so `room.memberIds` reflects everyone above.
  const room = (await getRoom(initialRoom.roomId))!;

  return {
    room,
    ownerId: owner.memberId,
    momId: mom.member.memberId,
    otherDadId: otherDad.memberId,
    otherMomId: otherMom.memberId,
    friendId: friend.memberId,
  };
}

describe("family-store", () => {
  it("creates a family and computes its weight from adults + children", async () => {
    const { room, ownerId, momId } = await setupTripWithTwoFamilies();
    const family = await createFamily({
      room,
      actorMemberId: ownerId,
      name: "Ивановы",
      memberIds: [ownerId, momId],
      childrenCount: 2,
    });
    expect(family.memberIds).toEqual([ownerId, momId]);
    expect(familyWeight(family)).toBe(4);

    const families = await listFamilies(room.roomId);
    expect(families).toHaveLength(1);
  });

  it("rejects a member already belonging to another family", async () => {
    const { room, ownerId, momId, otherDadId } = await setupTripWithTwoFamilies();
    await createFamily({ room, actorMemberId: ownerId, name: "Ивановы", memberIds: [ownerId, momId] });
    await expect(
      createFamily({ room, actorMemberId: ownerId, name: "Дубль", memberIds: [momId, otherDadId] }),
    ).rejects.toThrow("member_already_in_family");
  });

  it("rejects a memberId that isn't a room member", async () => {
    const { room, ownerId } = await setupTripWithTwoFamilies();
    await expect(
      createFamily({ room, actorMemberId: ownerId, name: "Ghost", memberIds: [ownerId, "nope"] }),
    ).rejects.toThrow("member_not_found");
  });

  it("updateFamily changes children count and membership", async () => {
    const { room, ownerId, momId, friendId } = await setupTripWithTwoFamilies();
    const family = await createFamily({
      room,
      actorMemberId: ownerId,
      name: "Ивановы",
      memberIds: [ownerId, momId],
      childrenCount: 1,
    });
    const updated = await updateFamily({
      room,
      familyId: family.id,
      childrenCount: 3,
      memberIds: [ownerId, momId, friendId],
    });
    expect(updated.childrenCount).toBe(3);
    expect(familyWeight(updated)).toBe(6);
  });

  it("deleteFamily removes it so members become available again", async () => {
    const { room, ownerId, momId } = await setupTripWithTwoFamilies();
    const family = await createFamily({ room, actorMemberId: ownerId, name: "Ивановы", memberIds: [ownerId, momId] });
    await deleteFamily(room, family.id);
    expect(await listFamilies(room.roomId)).toHaveLength(0);
    // Membership no longer blocked now that the family is gone.
    await expect(
      createFamily({ room, actorMemberId: ownerId, name: "Ивановы 2", memberIds: [ownerId, momId] }),
    ).resolves.toBeTruthy();
  });

  it("resolves a mixed selection of families and solo members into weighted representatives", async () => {
    const { room, ownerId, momId, otherDadId, otherMomId, friendId } = await setupTripWithTwoFamilies();
    await createFamily({
      room,
      actorMemberId: ownerId,
      name: "Ивановы",
      memberIds: [ownerId, momId],
      childrenCount: 2,
    });
    await createFamily({
      room,
      actorMemberId: ownerId,
      name: "Петровы",
      memberIds: [otherDadId, otherMomId],
      childrenCount: 1,
    });

    // Picking *any* member of a family (here the mom, not the representative dad)
    // still resolves to that family's representative (memberIds[0]).
    const resolved = await buildFamilyWeightedParticipants(room, [momId, otherDadId, friendId]);

    expect(resolved).toEqual([
      { memberId: ownerId, inputValue: "4" },
      { memberId: otherDadId, inputValue: "3" },
      { memberId: friendId, inputValue: "1" },
    ]);
  });

  it("deduplicates when multiple members of the same family are selected", async () => {
    const { room, ownerId, momId } = await setupTripWithTwoFamilies();
    await createFamily({
      room,
      actorMemberId: ownerId,
      name: "Ивановы",
      memberIds: [ownerId, momId],
      childrenCount: 0,
    });
    const resolved = await buildFamilyWeightedParticipants(room, [ownerId, momId]);
    expect(resolved).toEqual([{ memberId: ownerId, inputValue: "2" }]);
  });

  it("treats members with no family as one-person households", async () => {
    const { room, friendId } = await setupTripWithTwoFamilies();
    const resolved = await buildFamilyWeightedParticipants(room, [friendId]);
    expect(resolved).toEqual([{ memberId: friendId, inputValue: "1" }]);
  });

  it("stays in sync with a freshly refetched room (no stale membership)", async () => {
    const { room, ownerId } = await setupTripWithTwoFamilies();
    const freshRoom = await getRoom(room.roomId);
    expect(freshRoom).toBeTruthy();
    await expect(listFamilies(freshRoom!.roomId)).resolves.toEqual([]);
    expect(ownerId).toBeTruthy();
  });
});
