import { FAMILY_TTL_SEC, REDIS_FAMILY_IDS_PREFIX, REDIS_FAMILY_PREFIX } from "./constants";
import { canMutateRoom } from "./engine";
import { splitRedisDel, splitRedisGetJson, splitRedisSet } from "./redis";
import { generateEntityId } from "./tokens";
import type { SplitFamily, SplitRoom } from "./types";

function familyKey(id: string): string {
  return `${REDIS_FAMILY_PREFIX}${id}`;
}

function familyIdsKey(roomId: string): string {
  return `${REDIS_FAMILY_IDS_PREFIX}${roomId.toUpperCase()}`;
}

async function listFamilyIds(roomId: string): Promise<string[]> {
  return (await splitRedisGetJson<string[]>(familyIdsKey(roomId))) ?? [];
}

export async function listFamilies(roomId: string): Promise<SplitFamily[]> {
  const ids = await listFamilyIds(roomId);
  const out: SplitFamily[] = [];
  for (const id of ids) {
    const f = await splitRedisGetJson<SplitFamily>(familyKey(id));
    if (f) out.push(f);
  }
  return out;
}

/** Family weight for proportional splitting: adults (room members) + children. */
export function familyWeight(family: SplitFamily): number {
  return family.memberIds.length + Math.max(0, family.childrenCount);
}

async function assertValidMembership(
  room: SplitRoom,
  memberIds: string[],
  excludeFamilyId?: string,
): Promise<void> {
  if (memberIds.length === 0) throw new Error("no_participants");
  const uniqueIds = new Set(memberIds);
  if (uniqueIds.size !== memberIds.length) throw new Error("duplicate_participant");

  const validIds = new Set(room.memberIds);
  for (const id of memberIds) {
    if (!validIds.has(id)) throw new Error("member_not_found");
  }

  // Keep families disjoint — a member's family-weighted share only makes sense
  // once, otherwise the same person would be counted in two households at once.
  const families = await listFamilies(room.roomId);
  for (const f of families) {
    if (f.id === excludeFamilyId) continue;
    if (f.memberIds.some((id) => uniqueIds.has(id))) {
      throw new Error("member_already_in_family");
    }
  }
}

export async function createFamily(input: {
  room: SplitRoom;
  actorMemberId: string;
  name: string;
  memberIds: string[];
  childrenCount?: number;
}): Promise<SplitFamily> {
  const { room } = input;
  if (!canMutateRoom(room)) throw new Error("room_archived");
  if (!input.name.trim()) throw new Error("invalid_display_name");

  await assertValidMembership(room, input.memberIds);
  const childrenCount = Math.max(0, Math.trunc(input.childrenCount ?? 0));

  const now = Date.now();
  const family: SplitFamily = {
    id: generateEntityId("fam"),
    roomId: room.roomId,
    name: input.name.trim(),
    memberIds: input.memberIds,
    childrenCount,
    createdAt: now,
    updatedAt: now,
    createdBy: input.actorMemberId,
  };

  const ids = await listFamilyIds(room.roomId);
  ids.push(family.id);
  await splitRedisSet(familyKey(family.id), JSON.stringify(family), FAMILY_TTL_SEC);
  await splitRedisSet(familyIdsKey(room.roomId), JSON.stringify(ids), FAMILY_TTL_SEC);
  return family;
}

export async function updateFamily(input: {
  room: SplitRoom;
  familyId: string;
  name?: string;
  memberIds?: string[];
  childrenCount?: number;
}): Promise<SplitFamily> {
  const { room } = input;
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const existing = await splitRedisGetJson<SplitFamily>(familyKey(input.familyId));
  if (!existing || existing.roomId.toUpperCase() !== room.roomId.toUpperCase()) {
    throw new Error("family_not_found");
  }

  const nextMemberIds = input.memberIds ?? existing.memberIds;
  if (input.memberIds) {
    await assertValidMembership(room, nextMemberIds, existing.id);
  }
  const nextName = input.name?.trim();
  if (input.name !== undefined && !nextName) throw new Error("invalid_display_name");

  const updated: SplitFamily = {
    ...existing,
    name: nextName ?? existing.name,
    memberIds: nextMemberIds,
    childrenCount:
      input.childrenCount !== undefined
        ? Math.max(0, Math.trunc(input.childrenCount))
        : existing.childrenCount,
    updatedAt: Date.now(),
  };
  await splitRedisSet(familyKey(updated.id), JSON.stringify(updated), FAMILY_TTL_SEC);
  return updated;
}

export async function deleteFamily(room: SplitRoom, familyId: string): Promise<void> {
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const existing = await splitRedisGetJson<SplitFamily>(familyKey(familyId));
  if (!existing || existing.roomId.toUpperCase() !== room.roomId.toUpperCase()) {
    throw new Error("family_not_found");
  }

  const ids = (await listFamilyIds(room.roomId)).filter((id) => id !== familyId);
  await splitRedisDel(familyKey(familyId));
  await splitRedisSet(familyIdsKey(room.roomId), JSON.stringify(ids), FAMILY_TTL_SEC);
}

/**
 * Builds ExpenseParticipantInput[] for splitMethod "shares" proportional to
 * household size: each family's whole share lands on its billing representative
 * (memberIds[0]) — the household is expected to settle internally, which is the
 * point of grouping them. Any selected member not part of a family counts as
 * their own one-person household (weight 1). Callers may pass *any* member of a
 * family in `selectedMemberIds` — it always resolves to that family's
 * representative, so the client doesn't need to know who that is.
 */
export async function buildFamilyWeightedParticipants(
  room: SplitRoom,
  selectedMemberIds: string[],
): Promise<Array<{ memberId: string; inputValue: string }>> {
  const families = await listFamilies(room.roomId);
  const memberIdSet = new Set(room.memberIds);

  const familyByMember = new Map<string, SplitFamily>();
  for (const f of families) {
    for (const id of f.memberIds) familyByMember.set(id, f);
  }

  const seenFamilyIds = new Set<string>();
  const out: Array<{ memberId: string; inputValue: string }> = [];
  for (const memberId of selectedMemberIds) {
    if (!memberIdSet.has(memberId)) continue;
    const family = familyByMember.get(memberId);
    if (family) {
      if (seenFamilyIds.has(family.id)) continue;
      seenFamilyIds.add(family.id);
      out.push({ memberId: family.memberIds[0]!, inputValue: String(familyWeight(family)) });
    } else {
      out.push({ memberId, inputValue: "1" });
    }
  }
  return out;
}
