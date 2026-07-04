import {
  BIND_TTL_SEC,
  LOC_TTL_SEC,
  MEMBER_TTL_SEC,
  PAIR_TTL_SEC,
  PUSH_TTL_SEC,
  REDIS_BIND_PREFIX,
  REDIS_LOC_PREFIX,
  REDIS_MEMBER_PREFIX,
  REDIS_PAIR_PREFIX,
  REDIS_PUSH_PREFIX,
  REDIS_ROOM_PREFIX,
  REDIS_SOS_PREFIX,
  ROOM_TTL_SEC,
  SOS_TTL_SEC,
} from "./constants";
import { familyRedisDel, familyRedisGetJson, familyRedisSet } from "./redis";
import { normalizeMemberType, type FamilyMemberType } from "./member-types";
import type {
  FamilyBindToken,
  FamilyLocation,
  FamilyMember,
  FamilyMemberPublic,
  FamilyPairingRecord,
  FamilyParentPublic,
  FamilyPollSnapshot,
  FamilyPushSubscription,
  FamilyRoom,
  FamilySosState,
} from "./types";
import { generateAccessToken, generateBindToken, generateFamilyRoomId, generateMemberId, hashToken } from "./tokens";
import { isPhoneWhitelisted } from "@/lib/messenger/store";

function roomKey(roomId: string): string {
  return `${REDIS_ROOM_PREFIX}${roomId.toUpperCase()}`;
}

function memberKey(memberId: string): string {
  return `${REDIS_MEMBER_PREFIX}${memberId}`;
}

function locKey(memberId: string): string {
  return `${REDIS_LOC_PREFIX}${memberId}`;
}

function bindKey(token: string): string {
  return `${REDIS_BIND_PREFIX}${token}`;
}

function pairKey(token: string): string {
  return `${REDIS_PAIR_PREFIX}${token}`;
}

function sosKey(memberId: string): string {
  return `${REDIS_SOS_PREFIX}${memberId}`;
}

function pushKey(memberId: string): string {
  return `${REDIS_PUSH_PREFIX}${memberId}`;
}

async function saveRoom(room: FamilyRoom): Promise<void> {
  room.roomId = room.roomId.toUpperCase();
  room.updatedAt = Date.now();
  await familyRedisSet(roomKey(room.roomId), JSON.stringify(room), ROOM_TTL_SEC);
}

async function saveMember(member: FamilyMember): Promise<void> {
  await familyRedisSet(memberKey(member.memberId), JSON.stringify(member), MEMBER_TTL_SEC);
}

async function bumpRoomVersion(roomId: string): Promise<FamilyRoom | null> {
  const room = await getRoom(roomId);
  if (!room) return null;
  room.version += 1;
  await saveRoom(room);
  return room;
}

export async function getRoom(roomId: string): Promise<FamilyRoom | null> {
  return familyRedisGetJson<FamilyRoom>(roomKey(roomId));
}

export async function getMember(memberId: string): Promise<FamilyMember | null> {
  return familyRedisGetJson<FamilyMember>(memberKey(memberId));
}

export async function getLocation(memberId: string): Promise<FamilyLocation | null> {
  return familyRedisGetJson<FamilyLocation>(locKey(memberId));
}

export async function getSos(memberId: string): Promise<FamilySosState | null> {
  return familyRedisGetJson<FamilySosState>(sosKey(memberId));
}

export async function verifyMemberToken(memberId: string, accessToken: string): Promise<FamilyMember | null> {
  const member = await getMember(memberId);
  if (!member) return null;
  if (member.tokenHash !== hashToken(accessToken)) return null;
  return member;
}

export async function attachMemberMessengerPhone(
  memberId: string,
  messengerPhone?: string | null,
): Promise<void> {
  if (!messengerPhone) return;
  const member = await getMember(memberId);
  if (!member) return;
  if (member.messengerPhone === messengerPhone) return;
  member.messengerPhone = messengerPhone;
  await saveMember(member);
  if (member.roomId) await bumpRoomVersion(member.roomId);
}

export async function createFamilyRoom(
  name: string,
  ownerName = "Родитель",
  ownerMessengerPhone?: string | null,
): Promise<{
  room: FamilyRoom;
  ownerMemberId: string;
  accessToken: string;
}> {
  const roomId = generateFamilyRoomId();
  const ownerMemberId = generateMemberId();
  const accessToken = generateAccessToken();
  const now = Date.now();

  const room: FamilyRoom = {
    roomId,
    name: name.trim() || "Семья",
    createdAt: now,
    ownerMemberId,
    memberIds: [ownerMemberId],
    messengerRoomId: null,
    version: 1,
    updatedAt: now,
  };

  const owner: FamilyMember = {
    memberId: ownerMemberId,
    roomId,
    role: "owner",
    name: ownerName.trim() || "Родитель",
    tokenHash: hashToken(accessToken),
    createdAt: now,
    shareLocationWithChildren: false,
    shareLocationWithParents: false,
    messengerPhone: ownerMessengerPhone ?? null,
  };

  await saveRoom(room);
  await saveMember(owner);
  return { room, ownerMemberId, accessToken };
}

export async function countRoomObservers(roomId: string): Promise<number> {
  const room = await getRoom(roomId);
  if (!room) return 0;
  let count = 0;
  for (const memberId of room.memberIds) {
    const member = await getMember(memberId);
    if (member?.role === "observer") count += 1;
  }
  return count;
}

export async function createBindToken(
  roomId: string,
  role: "tracked" | "observer",
  name?: string,
): Promise<string> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("room_not_found");

  const token = generateBindToken();
  const payload: FamilyBindToken = {
    roomId: room.roomId,
    role,
    name: name?.trim() || undefined,
  };
  await familyRedisSet(bindKey(token), JSON.stringify(payload), BIND_TTL_SEC);
  return token;
}

export async function consumeBindToken(
  token: string,
  name?: string,
  messengerPhone?: string | null,
): Promise<{ member: FamilyMember; accessToken: string; room: FamilyRoom }> {
  const payload = await familyRedisGetJson<FamilyBindToken>(bindKey(token));
  if (!payload) throw new Error("bind_expired");

  await familyRedisDel(bindKey(token));

  const room = await getRoom(payload.roomId);
  if (!room) throw new Error("room_not_found");

  if (payload.role === "observer") {
    const observerCount = await countRoomObservers(room.roomId);
    if (observerCount >= 1) throw new Error("observer_slot_taken");
  }

  const memberId = generateMemberId();
  const accessToken = generateAccessToken();
  const memberName = name?.trim() || payload.name || (payload.role === "tracked" ? "Участник" : "Родитель");

  const member: FamilyMember = {
    memberId,
    roomId: room.roomId,
    role: payload.role,
    name: memberName,
    tokenHash: hashToken(accessToken),
    createdAt: Date.now(),
    shareLocationWithParents: payload.role === "tracked" ? true : false,
    shareLocationWithChildren: false,
    messengerPhone: messengerPhone ?? null,
  };

  room.memberIds.push(memberId);
  await saveMember(member);
  await saveRoom({ ...room, version: room.version + 1 });

  return { member, accessToken, room };
}

export async function createChildPairing(
  childName: string,
  messengerPhone?: string | null,
): Promise<{
  pairToken: string;
  memberId: string;
  accessToken: string;
  name: string;
}> {
  const pairToken = generateBindToken();
  const memberId = generateMemberId();
  const accessToken = generateAccessToken();
  const name = childName.trim() || "Участник";
  const now = Date.now();

  const member: FamilyMember = {
    memberId,
    roomId: "",
    role: "tracked",
    name,
    tokenHash: hashToken(accessToken),
    createdAt: now,
    memberType: "child",
    shareLocationWithParents: true,
    messengerPhone: messengerPhone ?? null,
  };

  const record: FamilyPairingRecord = {
    pairToken,
    childName: name,
    memberId,
    status: "pending",
    createdAt: now,
  };

  await saveMember(member);
  await familyRedisSet(pairKey(pairToken), JSON.stringify(record), PAIR_TTL_SEC);

  return { pairToken, memberId, accessToken, name };
}

export async function getPairingRecord(pairToken: string): Promise<FamilyPairingRecord | null> {
  return familyRedisGetJson<FamilyPairingRecord>(pairKey(pairToken));
}

export async function getPairingStatus(
  pairToken: string,
  accessToken: string,
): Promise<
  | { status: "pending" }
  | {
      status: "paired";
      session: {
        roomId: string;
        roomName: string;
        memberId: string;
        accessToken: string;
        name: string;
        parentName: string;
        role: "tracked";
      };
    }
  | null
> {
  const record = await getPairingRecord(pairToken);
  if (!record) return null;

  const member = await verifyMemberToken(record.memberId, accessToken);
  if (!member) return null;

  if (record.status === "pending") {
    return { status: "pending" };
  }

  if (!record.roomId || !record.roomName || !record.parentName) {
    return { status: "pending" };
  }

  return {
    status: "paired",
    session: {
      roomId: record.roomId,
      roomName: record.roomName,
      memberId: record.memberId,
      accessToken,
      name: record.childName,
      parentName: record.parentName,
      role: "tracked",
    },
  };
}

export async function adoptChildByPairToken(
  parentMemberId: string,
  pairToken: string,
  childNameOverride?: string,
  memberType?: FamilyMemberType,
): Promise<{ childName: string; memberId: string }> {
  const parent = await getMember(parentMemberId);
  if (!parent || (parent.role !== "owner" && parent.role !== "observer") || !parent.roomId) {
    throw new Error("forbidden");
  }

  const record = await getPairingRecord(pairToken);
  if (!record || record.status !== "pending") {
    throw new Error("pair_expired");
  }

  const child = await getMember(record.memberId);
  if (!child || child.role !== "tracked") {
    throw new Error("member_not_found");
  }

  const room = await getRoom(parent.roomId);
  if (!room) throw new Error("room_not_found");

  const parentMember = await getMember(room.ownerMemberId);
  const parentName = parentMember?.name ?? "Родитель";
  const finalChildName = childNameOverride?.trim() || record.childName;

  child.roomId = room.roomId;
  child.name = finalChildName;
  child.memberType = normalizeMemberType(memberType);
  if (child.shareLocationWithParents === undefined) {
    child.shareLocationWithParents = true;
  }
  if (!room.memberIds.includes(child.memberId)) {
    room.memberIds.push(child.memberId);
  }
  room.version += 1;

  const updatedRecord: FamilyPairingRecord = {
    ...record,
    childName: finalChildName,
    status: "paired",
    roomId: room.roomId,
    roomName: room.name,
    parentName,
  };

  await saveMember(child);
  await saveRoom(room);
  await familyRedisSet(pairKey(pairToken), JSON.stringify(updatedRecord), PAIR_TTL_SEC);

  return { childName: finalChildName, memberId: child.memberId };
}

export async function updateRoomMessengerLink(
  roomId: string,
  messengerRoomId: string | null,
): Promise<FamilyRoom | null> {
  const room = await getRoom(roomId);
  if (!room) return null;
  room.messengerRoomId = messengerRoomId ? messengerRoomId.toUpperCase() : null;
  room.version += 1;
  await saveRoom(room);
  return room;
}

export async function updateRoomSosPhone(roomId: string, sosPhone: string | null): Promise<FamilyRoom | null> {
  const room = await getRoom(roomId);
  if (!room) return null;
  room.sosPhone = sosPhone;
  room.version += 1;
  await saveRoom(room);
  return room;
}

async function maybeClearParentLocation(member: FamilyMember): Promise<void> {
  if (!member.shareLocationWithChildren && !member.shareLocationWithParents) {
    await familyRedisDel(locKey(member.memberId));
  }
}

export async function setShareLocationWithChildren(
  memberId: string,
  enabled: boolean,
): Promise<FamilyMember> {
  const member = await getMember(memberId);
  if (!member || (member.role !== "owner" && member.role !== "observer")) {
    throw new Error("forbidden");
  }

  member.shareLocationWithChildren = enabled;
  await saveMember(member);
  if (!enabled) await maybeClearParentLocation(member);
  if (member.roomId) await bumpRoomVersion(member.roomId);
  return member;
}

export async function setShareLocationWithParents(
  memberId: string,
  enabled: boolean,
): Promise<FamilyMember> {
  const member = await getMember(memberId);
  if (!member) throw new Error("member_not_found");

  if (member.role === "tracked") {
    member.shareLocationWithParents = enabled;
    await saveMember(member);
    if (!enabled) await familyRedisDel(locKey(memberId));
    if (member.roomId) await bumpRoomVersion(member.roomId);
    return member;
  }

  if (member.role !== "owner" && member.role !== "observer") {
    throw new Error("forbidden");
  }

  member.shareLocationWithParents = enabled;
  await saveMember(member);
  if (!enabled) await maybeClearParentLocation(member);
  if (member.roomId) await bumpRoomVersion(member.roomId);
  return member;
}

export async function updateLocation(
  memberId: string,
  input: { lat: number; lng: number; accuracy: number; battery?: number | null },
): Promise<FamilyLocation> {
  const member = await getMember(memberId);
  if (!member || !member.roomId) throw new Error("not_tracked");

  const canShareAsParent =
    (member.role === "owner" || member.role === "observer") &&
    (member.shareLocationWithChildren === true || member.shareLocationWithParents === true);
  const canShareAsTracked = member.role === "tracked" && member.shareLocationWithParents !== false;
  if (member.role === "tracked" && !canShareAsTracked) throw new Error("not_sharing");
  if (member.role !== "tracked" && !canShareAsParent) throw new Error("not_tracked");

  const location: FamilyLocation = {
    memberId,
    lat: input.lat,
    lng: input.lng,
    accuracy: input.accuracy,
    battery: input.battery ?? null,
    updatedAt: Date.now(),
  };

  await familyRedisSet(locKey(memberId), JSON.stringify(location), LOC_TTL_SEC);
  await saveMember(member);
  await bumpRoomVersion(member.roomId);
  return location;
}

export async function activateSos(
  memberId: string,
  input: { lat: number; lng: number },
): Promise<FamilySosState> {
  const member = await getMember(memberId);
  if (!member || member.role !== "tracked" || !member.roomId) throw new Error("not_tracked");

  const sos: FamilySosState = {
    memberId,
    active: true,
    lat: input.lat,
    lng: input.lng,
    startedAt: Date.now(),
  };

  await familyRedisSet(sosKey(memberId), JSON.stringify(sos), SOS_TTL_SEC);
  await saveMember(member);
  await bumpRoomVersion(member.roomId);
  return sos;
}

export async function clearSos(memberId: string): Promise<void> {
  const member = await getMember(memberId);
  if (!member) return;
  await familyRedisDel(sosKey(memberId));
  await bumpRoomVersion(member.roomId);
}

async function deleteMemberKeys(memberId: string): Promise<void> {
  await familyRedisDel(memberKey(memberId), locKey(memberId), sosKey(memberId), pushKey(memberId));
}

export async function leaveFamily(memberId: string): Promise<void> {
  const member = await getMember(memberId);
  if (!member) throw new Error("member_not_found");
  if (member.role === "owner") throw new Error("cannot_leave_as_owner");
  if (!member.roomId) throw new Error("forbidden");

  const room = await getRoom(member.roomId);
  if (!room) throw new Error("room_not_found");

  room.memberIds = room.memberIds.filter((id) => id !== memberId);
  room.version += 1;
  await saveRoom(room);
  await deleteMemberKeys(memberId);
}

export async function removeMember(actorMemberId: string, targetMemberId: string): Promise<void> {
  const actor = await getMember(actorMemberId);
  const target = await getMember(targetMemberId);
  if (!actor || !target) throw new Error("member_not_found");
  if (actor.roomId !== target.roomId) throw new Error("forbidden");
  if (actor.role !== "owner") throw new Error("forbidden");
  if (target.role === "owner") throw new Error("cannot_remove_owner");

  const room = await getRoom(actor.roomId);
  if (!room) throw new Error("room_not_found");

  room.memberIds = room.memberIds.filter((id) => id !== targetMemberId);
  room.version += 1;
  await saveRoom(room);
  await deleteMemberKeys(targetMemberId);
}

export async function deleteFamilyRoom(roomId: string, ownerMemberId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("room_not_found");
  if (room.ownerMemberId !== ownerMemberId) throw new Error("forbidden");

  const keys: string[] = [roomKey(room.roomId)];
  for (const memberId of room.memberIds) {
    keys.push(memberKey(memberId), locKey(memberId), sosKey(memberId), pushKey(memberId));
  }
  await familyRedisDel(...keys);
}

export async function savePushSubscriptions(
  memberId: string,
  subscriptions: FamilyPushSubscription[],
): Promise<void> {
  await familyRedisSet(pushKey(memberId), JSON.stringify(subscriptions), PUSH_TTL_SEC);
}

export async function getPushSubscriptions(memberId: string): Promise<FamilyPushSubscription[]> {
  return (await familyRedisGetJson<FamilyPushSubscription[]>(pushKey(memberId))) ?? [];
}

export async function getObserverPushTargets(roomId: string): Promise<FamilyPushSubscription[]> {
  const room = await getRoom(roomId);
  if (!room) return [];

  const all: FamilyPushSubscription[] = [];
  for (const memberId of room.memberIds) {
    const member = await getMember(memberId);
    if (!member || member.role === "tracked") continue;
    const subs = await getPushSubscriptions(memberId);
    all.push(...subs);
  }
  return all;
}

export async function buildPollSnapshot(
  roomId: string,
  viewerMemberId?: string,
): Promise<FamilyPollSnapshot | null> {
  const room = await getRoom(roomId);
  if (!room) return null;

  const viewer = viewerMemberId ? await getMember(viewerMemberId) : null;
  const viewerIsParent = viewer?.role === "owner" || viewer?.role === "observer";
  const viewerIsTracked = viewer?.role === "tracked";

  const members: FamilyMemberPublic[] = [];
  const locations: FamilyLocation[] = [];
  const sos: FamilySosState[] = [];
  const parents: FamilyParentPublic[] = [];
  const messengerAllowedCache = new Map<string, boolean>();

  function toParentPublic(member: FamilyMember, isCreator: boolean): FamilyParentPublic {
    return {
      memberId: member.memberId,
      name: member.name,
      isCreator,
      shareLocationWithChildren: member.shareLocationWithChildren ?? false,
      shareLocationWithParents: member.shareLocationWithParents ?? false,
      messengerPeerPhone: null,
    };
  }

  async function resolveMessengerPeerPhone(member: FamilyMember): Promise<string | null> {
    const phone = member.messengerPhone?.trim();
    if (!phone) return null;
    if (member.memberId === viewerMemberId) return null;
    const cached = messengerAllowedCache.get(phone);
    if (cached !== undefined) return cached ? phone : null;
    const allowed = await isPhoneWhitelisted(phone);
    messengerAllowedCache.set(phone, allowed);
    return allowed ? phone : null;
  }

  function includeParentLocation(member: FamilyMember, loc: FamilyLocation): boolean {
    if (member.memberId === viewerMemberId) return false;
    if (viewerIsTracked && member.shareLocationWithChildren) return true;
    if (viewerIsParent && member.shareLocationWithParents) return true;
    return false;
  }

  const ownerMember = await getMember(room.ownerMemberId);
  if (ownerMember) {
    const ownerPublic = toParentPublic(ownerMember, true);
    ownerPublic.messengerPeerPhone = await resolveMessengerPeerPhone(ownerMember);
    parents.push(ownerPublic);
  }

  for (const memberId of room.memberIds) {
    const member = await getMember(memberId);
    if (!member) continue;

    if (member.role === "observer") {
      const parentPublic = toParentPublic(member, false);
      parentPublic.messengerPeerPhone = await resolveMessengerPeerPhone(member);
      parents.push(parentPublic);
    }

    if (member.role === "tracked") {
      const sharesWithParents = member.shareLocationWithParents !== false;
      members.push({
        memberId: member.memberId,
        role: member.role,
        name: member.name,
        memberType: member.memberType,
        shareLocationWithParents: sharesWithParents,
        messengerPeerPhone: await resolveMessengerPeerPhone(member),
      });
      const loc = await getLocation(memberId);
      if (loc && sharesWithParents) locations.push(loc);
      const sosState = await getSos(memberId);
      if (sosState?.active) sos.push(sosState);
      continue;
    }

    if (member.role === "owner" || member.role === "observer") {
      const loc = await getLocation(memberId);
      if (loc && includeParentLocation(member, loc)) {
        locations.push(loc);
      }
    }
  }

  const parent = parents[0] ?? {
    memberId: room.ownerMemberId,
    name: ownerMember?.name ?? "Родитель",
    isCreator: true,
    shareLocationWithChildren: false,
    shareLocationWithParents: false,
    messengerPeerPhone: null,
  };

  const { ownerMemberId: _omit, ...roomPublic } = room;
  return {
    room: roomPublic,
    parent,
    parents,
    members,
    locations,
    sos,
    version: room.version,
  };
}

export async function refreshMemberHeartbeat(memberId: string): Promise<void> {
  const member = await getMember(memberId);
  if (!member) return;
  await saveMember(member);
  if (!member.roomId) return;
  const room = await getRoom(member.roomId);
  if (room) await saveRoom(room);
}
