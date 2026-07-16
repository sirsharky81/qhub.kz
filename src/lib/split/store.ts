import {
  EXPENSE_TTL_SEC,
  INVITE_TTL_SEC,
  MEMBER_TTL_SEC,
  REDIS_EXPENSE_IDS_PREFIX,
  REDIS_EXPENSE_PREFIX,
  REDIS_INVITE_PREFIX,
  REDIS_MEMBER_PREFIX,
  REDIS_MUTATION_PREFIX,
  REDIS_ROOM_PREFIX,
  REDIS_SETTLEMENT_IDS_PREFIX,
  REDIS_SETTLEMENT_PREFIX,
  ROOM_TTL_SEC,
  SETTLEMENT_TTL_SEC,
  SUPPORTED_CURRENCIES,
} from "./constants";
import {
  areBalancesSettled,
  areExpensesLocked,
  assertSettlementAllowed,
  canLeaveRoom,
  canMutateExpense,
  canMutateRoom,
  computeAmountBase,
  normalizeShares,
  SplitValidationError,
  suggestSettlements,
  withExpenseLockState,
} from "./engine";
import { d, money } from "./decimal";
import { computeEffectiveBalances, decideConfirmation } from "./ledger-repo";
import { splitRedisDel, splitRedisGetJson, splitRedisSet } from "./redis";
import {
  generateAccessToken,
  generateEntityId,
  generateInviteToken,
  generateMemberId,
  generateSplitRoomId,
  hashToken,
} from "./tokens";
import type {
  DebtSettlement,
  ExpenseParticipantInput,
  Money,
  ParticipantStatus,
  SplitExpense,
  SplitInvitation,
  SplitInviteChannel,
  SplitMember,
  SplitMemberPublic,
  SplitMethod,
  SplitRoom,
  SplitRoomRole,
  SplitRoomSnapshot,
} from "./types";

function roomKey(roomId: string): string {
  return `${REDIS_ROOM_PREFIX}${roomId.toUpperCase()}`;
}
function memberKey(memberId: string): string {
  return `${REDIS_MEMBER_PREFIX}${memberId}`;
}
function inviteKey(token: string): string {
  return `${REDIS_INVITE_PREFIX}${token}`;
}
function expenseKey(id: string): string {
  return `${REDIS_EXPENSE_PREFIX}${id}`;
}
function expenseIdsKey(roomId: string): string {
  return `${REDIS_EXPENSE_IDS_PREFIX}${roomId.toUpperCase()}`;
}
function settlementKey(id: string): string {
  return `${REDIS_SETTLEMENT_PREFIX}${id}`;
}
function settlementIdsKey(roomId: string): string {
  return `${REDIS_SETTLEMENT_IDS_PREFIX}${roomId.toUpperCase()}`;
}
function mutationKey(roomId: string, clientMutationId: string): string {
  return `${REDIS_MUTATION_PREFIX}${roomId.toUpperCase()}:${clientMutationId}`;
}

async function saveRoom(room: SplitRoom): Promise<void> {
  room.roomId = room.roomId.toUpperCase();
  room.updatedAt = Date.now();
  await splitRedisSet(roomKey(room.roomId), JSON.stringify(room), ROOM_TTL_SEC);
}

export async function persistSplitRoom(room: SplitRoom): Promise<void> {
  await saveRoom(room);
}

async function saveMember(member: SplitMember): Promise<void> {
  await splitRedisSet(memberKey(member.memberId), JSON.stringify(member), MEMBER_TTL_SEC);
}

/** Back-compat: legacy rows without status are connected if they have a token. */
export function normalizeMember(raw: SplitMember): SplitMember {
  const tokenHash = raw.tokenHash ?? null;
  const status: ParticipantStatus =
    raw.status ?? (tokenHash ? "connected" : "local");
  return {
    ...raw,
    status,
    tokenHash,
    sessionTokenHashes: raw.sessionTokenHashes ?? [],
    deviceWhitelist: raw.deviceWhitelist ?? [],
    linkedUserId: raw.linkedUserId ?? null,
    avatarUrl: raw.avatarUrl ?? null,
  };
}

export function toPublicMember(raw: SplitMember): SplitMemberPublic {
  const m = normalizeMember(raw);
  return {
    memberId: m.memberId,
    roomId: m.roomId,
    displayName: m.displayName,
    role: m.role,
    status: m.status,
    deviceWhitelist: m.deviceWhitelist,
    linkedUserId: m.linkedUserId,
    avatarUrl: m.avatarUrl,
    joinedAt: m.joinedAt,
    leftAt: m.leftAt,
  };
}

export function isMemberConnected(member: SplitMember): boolean {
  const m = normalizeMember(member);
  return m.status === "connected" && Boolean(m.tokenHash);
}

function matchesAccessToken(member: SplitMember, accessToken: string): boolean {
  const m = normalizeMember(member);
  const h = hashToken(accessToken);
  if (m.tokenHash && m.tokenHash === h) return true;
  return (m.sessionTokenHashes ?? []).includes(h);
}

async function bumpRoomVersion(roomId: string): Promise<SplitRoom> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("room_not_found");
  room.version += 1;
  await saveRoom(room);
  return room;
}

export async function bumpSplitRoomVersion(roomId: string): Promise<SplitRoom> {
  return bumpRoomVersion(roomId);
}

export async function getRoom(roomId: string): Promise<SplitRoom | null> {
  return splitRedisGetJson<SplitRoom>(roomKey(roomId));
}

export async function getMember(memberId: string): Promise<SplitMember | null> {
  const raw = await splitRedisGetJson<SplitMember>(memberKey(memberId));
  return raw ? normalizeMember(raw) : null;
}

export async function verifyMemberToken(memberId: string, accessToken: string): Promise<SplitMember | null> {
  const member = await getMember(memberId);
  if (!member || member.leftAt) return null;
  if (!isMemberConnected(member)) return null;
  if (!matchesAccessToken(member, accessToken)) return null;
  return member;
}

export async function createSplitRoom(input: {
  name?: string;
  ownerName?: string;
  baseCurrency?: string;
}): Promise<{ room: SplitRoom; owner: SplitMember; accessToken: string }> {
  const baseCurrency = (input.baseCurrency ?? "KZT").toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(baseCurrency as (typeof SUPPORTED_CURRENCIES)[number])) {
    throw new Error("unsupported_currency");
  }

  const roomId = generateSplitRoomId();
  const ownerMemberId = generateMemberId();
  const accessToken = generateAccessToken();
  const now = Date.now();

  const room: SplitRoom = {
    roomId,
    name: input.name?.trim() || "Split",
    baseCurrency,
    rates: [],
    status: "open",
    ownerMemberId,
    memberIds: [ownerMemberId],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  const owner: SplitMember = {
    memberId: ownerMemberId,
    roomId,
    displayName: input.ownerName?.trim() || "Владелец",
    role: "owner",
    status: "connected",
    tokenHash: hashToken(accessToken),
    sessionTokenHashes: [],
    deviceWhitelist: [],
    linkedUserId: null,
    avatarUrl: null,
    joinedAt: now,
  };

  await saveRoom(room);
  await saveMember(owner);
  await splitRedisSet(expenseIdsKey(roomId), JSON.stringify([]), EXPENSE_TTL_SEC);
  await splitRedisSet(settlementIdsKey(roomId), JSON.stringify([]), SETTLEMENT_TTL_SEC);

  return { room, owner, accessToken };
}

export async function createInvitation(input: {
  roomId: string;
  createdBy: string;
  role?: SplitRoomRole;
  channel?: SplitInviteChannel;
  seatMemberId?: string | null;
}): Promise<SplitInvitation> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const seatMemberId = input.seatMemberId ?? null;
  if (seatMemberId) {
    const seat = await getMember(seatMemberId);
    if (!seat || seat.roomId.toUpperCase() !== room.roomId.toUpperCase() || seat.leftAt) {
      throw new Error("member_not_found");
    }
    if (isMemberConnected(seat)) throw new Error("already_connected");
  }

  const token = generateInviteToken();
  const invitation: SplitInvitation = {
    token,
    roomId: room.roomId,
    role: input.role === "owner" ? "member" : (input.role ?? "member"),
    channel: input.channel ?? "link",
    expiresAt: Date.now() + INVITE_TTL_SEC * 1000,
    createdBy: input.createdBy,
    createdAt: Date.now(),
    seatMemberId,
    consumedAt: null,
  };
  await splitRedisSet(inviteKey(token), JSON.stringify(invitation), INVITE_TTL_SEC);

  if (seatMemberId) {
    const seat = (await getMember(seatMemberId))!;
    seat.status = "pending_invite";
    await saveMember(seat);
  }

  await bumpRoomVersion(room.roomId);
  return invitation;
}

export async function addLocalParticipant(input: {
  roomId: string;
  displayName: string;
  avatarUrl?: string | null;
  role?: SplitRoomRole;
}): Promise<SplitMember> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const name = input.displayName.trim();
  if (!name) throw new Error("invalid_display_name");

  const member: SplitMember = {
    memberId: generateMemberId(),
    roomId: room.roomId,
    displayName: name,
    role: input.role === "owner" ? "member" : "member",
    status: "local",
    tokenHash: null,
    sessionTokenHashes: [],
    deviceWhitelist: [],
    linkedUserId: null,
    avatarUrl: input.avatarUrl?.trim() || null,
    joinedAt: Date.now(),
  };

  room.memberIds.push(member.memberId);
  await saveMember(member);
  await saveRoom(room);
  await bumpRoomVersion(room.roomId);
  return normalizeMember(member);
}

export async function renameParticipant(input: {
  roomId: string;
  memberId: string;
  displayName: string;
  avatarUrl?: string | null;
}): Promise<SplitMember> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");
  const member = await getMember(input.memberId);
  if (!member || member.roomId.toUpperCase() !== room.roomId.toUpperCase() || member.leftAt) {
    throw new Error("member_not_found");
  }
  const name = input.displayName.trim();
  if (!name) throw new Error("invalid_display_name");
  member.displayName = name;
  if (input.avatarUrl !== undefined) {
    member.avatarUrl = input.avatarUrl?.trim() || null;
  }
  await saveMember(member);
  await bumpRoomVersion(room.roomId);
  return normalizeMember(member);
}

export async function transferOwnership(input: {
  roomId: string;
  toMemberId: string;
}): Promise<SplitRoom> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const nextOwner = await getMember(input.toMemberId);
  if (!nextOwner || nextOwner.roomId.toUpperCase() !== room.roomId.toUpperCase() || nextOwner.leftAt) {
    throw new Error("member_not_found");
  }

  const prevOwner = await getMember(room.ownerMemberId);
  if (prevOwner && prevOwner.memberId !== nextOwner.memberId) {
    prevOwner.role = "member";
    await saveMember(prevOwner);
  }
  nextOwner.role = "owner";
  await saveMember(nextOwner);
  room.ownerMemberId = nextOwner.memberId;
  await saveRoom(room);
  await bumpRoomVersion(room.roomId);
  return (await getRoom(room.roomId))!;
}

/** Owner-only mutations: owner if connected, else any connected caretaker. */
export async function canActAsOwner(room: SplitRoom, actorMemberId: string): Promise<boolean> {
  if (room.ownerMemberId === actorMemberId) return true;
  const owner = await getMember(room.ownerMemberId);
  if (!owner || isMemberConnected(owner)) return false;
  const actor = await getMember(actorMemberId);
  return Boolean(actor && isMemberConnected(actor) && !actor.leftAt);
}

export async function addDeviceToWhitelist(input: {
  roomId: string;
  memberId: string;
  deviceKey: string;
}): Promise<SplitMember> {
  const member = await getMember(input.memberId);
  if (!member || member.roomId.toUpperCase() !== input.roomId.toUpperCase() || member.leftAt) {
    throw new Error("member_not_found");
  }
  if (!isMemberConnected(member)) throw new Error("not_connected");
  const key = input.deviceKey.trim();
  if (!key) throw new Error("invalid_device_key");
  const hashed = hashToken(key);
  const list = member.deviceWhitelist ?? [];
  if (!list.includes(hashed)) {
    member.deviceWhitelist = [...list, hashed];
    await saveMember(member);
    await bumpRoomVersion(input.roomId);
  }
  return normalizeMember(member);
}

export async function createWhitelistedSession(input: {
  roomId: string;
  memberId: string;
  deviceKey: string;
}): Promise<{ member: SplitMember; accessToken: string }> {
  const member = await getMember(input.memberId);
  if (!member || member.roomId.toUpperCase() !== input.roomId.toUpperCase() || member.leftAt) {
    throw new Error("member_not_found");
  }
  if (!isMemberConnected(member)) throw new Error("not_connected");
  const hashedDevice = hashToken(input.deviceKey.trim());
  if (!(member.deviceWhitelist ?? []).includes(hashedDevice)) {
    throw new Error("device_not_whitelisted");
  }
  const accessToken = generateAccessToken();
  const h = hashToken(accessToken);
  member.sessionTokenHashes = [...(member.sessionTokenHashes ?? []), h];
  await saveMember(member);
  await bumpRoomVersion(input.roomId);
  return { member: normalizeMember(member), accessToken };
}

async function consumeInvitation(invitation: SplitInvitation): Promise<void> {
  invitation.consumedAt = Date.now();
  await splitRedisSet(inviteKey(invitation.token), JSON.stringify(invitation), INVITE_TTL_SEC);
}

export async function joinRoom(input: {
  token: string;
  displayName: string;
  deviceKey?: string | null;
}): Promise<{ room: SplitRoom; member: SplitMember; accessToken: string }> {
  const invitation = await splitRedisGetJson<SplitInvitation>(inviteKey(input.token));
  if (!invitation || invitation.expiresAt < Date.now()) throw new Error("invite_expired");
  if (invitation.consumedAt) throw new Error("invite_consumed");

  const room = await getRoom(invitation.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  // Seat-bound claim — keep the same Participant id.
  if (invitation.seatMemberId) {
    const seat = await getMember(invitation.seatMemberId);
    if (!seat || seat.leftAt) throw new Error("member_not_found");

    if (isMemberConnected(seat)) {
      // Second device: only if whitelisted.
      if (!input.deviceKey) throw new Error("device_not_whitelisted");
      const hashedDevice = hashToken(input.deviceKey.trim());
      if (!(seat.deviceWhitelist ?? []).includes(hashedDevice)) {
        throw new Error("device_not_whitelisted");
      }
      const accessToken = generateAccessToken();
      seat.sessionTokenHashes = [...(seat.sessionTokenHashes ?? []), hashToken(accessToken)];
      await saveMember(seat);
      await consumeInvitation(invitation);
      await bumpRoomVersion(room.roomId);
      return { room: (await getRoom(room.roomId))!, member: normalizeMember(seat), accessToken };
    }

    const accessToken = generateAccessToken();
    const name = input.displayName.trim() || seat.displayName;
    seat.displayName = name;
    seat.status = "connected";
    seat.tokenHash = hashToken(accessToken);
    seat.sessionTokenHashes = [];
    if (input.deviceKey?.trim()) {
      seat.deviceWhitelist = Array.from(
        new Set([...(seat.deviceWhitelist ?? []), hashToken(input.deviceKey.trim())]),
      );
    }
    await saveMember(seat);
    await consumeInvitation(invitation);
    await bumpRoomVersion(room.roomId);
    return { room: (await getRoom(room.roomId))!, member: normalizeMember(seat), accessToken };
  }

  // Legacy generic invite — new connected seat (reusable until expiry).
  const accessToken = generateAccessToken();
  const memberId = generateMemberId();
  const member: SplitMember = {
    memberId,
    roomId: room.roomId,
    displayName: input.displayName.trim() || "Участник",
    role: invitation.role === "owner" ? "member" : invitation.role,
    status: "connected",
    tokenHash: hashToken(accessToken),
    sessionTokenHashes: [],
    deviceWhitelist: input.deviceKey?.trim() ? [hashToken(input.deviceKey.trim())] : [],
    linkedUserId: null,
    avatarUrl: null,
    joinedAt: Date.now(),
  };

  room.memberIds.push(memberId);
  await saveMember(member);
  await saveRoom(room);
  await bumpRoomVersion(room.roomId);

  return { room: (await getRoom(room.roomId))!, member: normalizeMember(member), accessToken };
}

export async function listMembers(roomId: string): Promise<SplitMember[]> {
  const room = await getRoom(roomId);
  if (!room) return [];
  const members: SplitMember[] = [];
  for (const id of room.memberIds) {
    const m = await getMember(id);
    if (m && !m.leftAt) members.push(normalizeMember(m));
  }
  return members;
}

export async function setRoomRates(
  roomId: string,
  actorMemberId: string,
  rates: Array<{ currency: string; rate: Money }>,
): Promise<SplitRoom> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");
  if (!(await canActAsOwner(room, actorMemberId))) throw new Error("forbidden");

  const next = rates.map((r) => {
    const currency = r.currency.toUpperCase();
    if (currency === room.baseCurrency) throw new Error("rate_for_base_currency");
    if (!d(r.rate).gt(0)) throw new Error("invalid_rate");
    return {
      currency,
      rate: money(r.rate),
      updatedAt: Date.now(),
      updatedBy: actorMemberId,
    };
  });
  room.rates = next;
  await saveRoom(room);
  return bumpRoomVersion(roomId);
}

function resolveExchangeRate(room: SplitRoom, currencyOriginal: string): Money {
  const currency = currencyOriginal.toUpperCase();
  if (currency === room.baseCurrency) return money(1);
  const found = room.rates.find((r) => r.currency === currency);
  if (!found) throw new Error("missing_exchange_rate");
  return found.rate;
}

async function listExpenseIds(roomId: string): Promise<string[]> {
  return (await splitRedisGetJson<string[]>(expenseIdsKey(roomId))) ?? [];
}

async function listSettlementIds(roomId: string): Promise<string[]> {
  return (await splitRedisGetJson<string[]>(settlementIdsKey(roomId))) ?? [];
}

export async function listExpenses(roomId: string): Promise<SplitExpense[]> {
  const ids = await listExpenseIds(roomId);
  const out: SplitExpense[] = [];
  for (const id of ids) {
    const e = await splitRedisGetJson<SplitExpense>(expenseKey(id));
    if (e) out.push(e);
  }
  return out;
}

export async function listSettlements(roomId: string): Promise<DebtSettlement[]> {
  const ids = await listSettlementIds(roomId);
  const out: DebtSettlement[] = [];
  for (const id of ids) {
    const s = await splitRedisGetJson<DebtSettlement>(settlementKey(id));
    if (s) out.push(s);
  }
  return out;
}

async function findMutationId(
  roomId: string,
  clientMutationId: string | null | undefined,
): Promise<string | null> {
  if (!clientMutationId) return null;
  const existing = await splitRedisGetJson<{ id: string }>(mutationKey(roomId, clientMutationId));
  return existing?.id ?? null;
}

export async function findSplitMutationId(
  roomId: string,
  clientMutationId: string | null | undefined,
): Promise<string | null> {
  return findMutationId(roomId, clientMutationId);
}

async function saveMutationId(
  roomId: string,
  clientMutationId: string | null | undefined,
  resultId: string,
): Promise<void> {
  if (!clientMutationId) return;
  await splitRedisSet(
    mutationKey(roomId, clientMutationId),
    JSON.stringify({ id: resultId }),
    ROOM_TTL_SEC,
  );
}

export async function saveSplitMutationId(
  roomId: string,
  clientMutationId: string | null | undefined,
  resultId: string,
): Promise<void> {
  return saveMutationId(roomId, clientMutationId, resultId);
}

export async function createExpense(input: {
  roomId: string;
  actorMemberId: string;
  description: string;
  amountOriginal: Money;
  currencyOriginal: string;
  categoryId?: string;
  paidByMemberId: string;
  splitMethod: SplitMethod;
  participants: ExpenseParticipantInput[];
  comment?: string | null;
  geo?: { lat: number; lng: number } | null;
  date?: number;
  clientMutationId?: string | null;
}): Promise<SplitExpense> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const settlements = await listSettlements(room.roomId);
  if (areExpensesLocked(settlements)) {
    // New correcting expenses are allowed; edits to old ones are not.
  }

  const existingId = await findMutationId(room.roomId, input.clientMutationId);
  if (existingId) {
    const existing = await splitRedisGetJson<SplitExpense>(expenseKey(existingId));
    if (existing) return existing;
  }

  const exchangeRate = resolveExchangeRate(room, input.currencyOriginal);
  const amountBase = computeAmountBase(input.amountOriginal, exchangeRate);
  const shares = normalizeShares({
    amountOriginal: money(input.amountOriginal),
    amountBase,
    splitMethod: input.splitMethod,
    participants: input.participants,
  });

  const id = generateEntityId("exp");
  await saveMutationId(room.roomId, input.clientMutationId, id);

  const now = input.date ?? Date.now();
  const expense: SplitExpense = {
    id,
    roomId: room.roomId,
    description: input.description.trim() || "Расход",
    amountOriginal: money(input.amountOriginal),
    currencyOriginal: input.currencyOriginal.toUpperCase(),
    exchangeRate,
    exchangeTimestamp: now,
    amountBase,
    categoryId: input.categoryId || "other",
    paidByMemberId: input.paidByMemberId,
    splitMethod: input.splitMethod,
    participantIds: shares.map((s) => s.memberId),
    participants: shares,
    comment: input.comment ?? null,
    geo: input.geo ?? null,
    locked: areExpensesLocked(settlements),
    createdBy: input.actorMemberId,
    createdAt: now,
    updatedAt: now,
    version: 1,
    clientMutationId: input.clientMutationId ?? null,
  };

  const ids = await listExpenseIds(room.roomId);
  ids.push(id);
  await splitRedisSet(expenseKey(id), JSON.stringify(expense), EXPENSE_TTL_SEC);
  await splitRedisSet(expenseIdsKey(room.roomId), JSON.stringify(ids), EXPENSE_TTL_SEC);
  await bumpRoomVersion(room.roomId);
  return expense;
}

export async function updateExpense(input: {
  roomId: string;
  expenseId: string;
  actorMemberId: string;
  description?: string;
  amountOriginal?: Money;
  currencyOriginal?: string;
  categoryId?: string;
  paidByMemberId?: string;
  splitMethod?: SplitMethod;
  participants?: ExpenseParticipantInput[];
  comment?: string | null;
}): Promise<SplitExpense> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const settlements = await listSettlements(room.roomId);
  const existing = await splitRedisGetJson<SplitExpense>(expenseKey(input.expenseId));
  if (!existing || existing.roomId !== room.roomId) throw new Error("expense_not_found");
  if (!canMutateExpense(existing, settlements)) throw new Error("expense_locked");

  const currencyOriginal = (input.currencyOriginal ?? existing.currencyOriginal).toUpperCase();
  const amountOriginal = money(input.amountOriginal ?? existing.amountOriginal);
  const exchangeRate = resolveExchangeRate(room, currencyOriginal);
  const amountBase = computeAmountBase(amountOriginal, exchangeRate);
  const splitMethod = input.splitMethod ?? existing.splitMethod;
  const participantInputs =
    input.participants ??
    existing.participants.map((p) => ({
      memberId: p.memberId,
      inputValue: p.inputValue ?? undefined,
    }));
  const shares = normalizeShares({
    amountOriginal,
    amountBase,
    splitMethod,
    participants: participantInputs,
  });

  const updated: SplitExpense = {
    ...existing,
    description: input.description?.trim() || existing.description,
    amountOriginal,
    currencyOriginal,
    exchangeRate,
    exchangeTimestamp: Date.now(),
    amountBase,
    categoryId: input.categoryId ?? existing.categoryId,
    paidByMemberId: input.paidByMemberId ?? existing.paidByMemberId,
    splitMethod,
    participantIds: shares.map((s) => s.memberId),
    participants: shares,
    comment: input.comment === undefined ? existing.comment : input.comment,
    updatedAt: Date.now(),
    version: existing.version + 1,
  };

  await splitRedisSet(expenseKey(updated.id), JSON.stringify(updated), EXPENSE_TTL_SEC);
  await bumpRoomVersion(room.roomId);
  return updated;
}

export async function deleteExpense(roomId: string, expenseId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");
  const settlements = await listSettlements(room.roomId);
  const existing = await splitRedisGetJson<SplitExpense>(expenseKey(expenseId));
  if (!existing || existing.roomId !== room.roomId) throw new Error("expense_not_found");
  if (!canMutateExpense(existing, settlements)) throw new Error("expense_locked");

  const ids = (await listExpenseIds(room.roomId)).filter((id) => id !== expenseId);
  await splitRedisDel(expenseKey(expenseId));
  await splitRedisSet(expenseIdsKey(room.roomId), JSON.stringify(ids), EXPENSE_TTL_SEC);
  await bumpRoomVersion(room.roomId);
}

export async function createSettlement(input: {
  roomId: string;
  actorMemberId: string;
  fromMemberId: string;
  toMemberId: string;
  amountBase: Money;
  date?: string;
  comment?: string | null;
  clientMutationId?: string | null;
}): Promise<DebtSettlement> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const existingId = await findMutationId(room.roomId, input.clientMutationId);
  if (existingId) {
    const existing = await splitRedisGetJson<DebtSettlement>(settlementKey(existingId));
    if (existing) return existing;
  }

  const expenses = await listExpenses(room.roomId);
  const settlements = await listSettlements(room.roomId);
  // Ledger-aware: once advanced accounting (assets/contributions) is on, a member's
  // real balance can differ from what plain expenses show — see computeEffectiveBalances.
  const balances = await computeEffectiveBalances({ room, expenses, settlements });
  assertSettlementAllowed(balances, input.fromMemberId, input.toMemberId, money(input.amountBase));

  const recipient = await getMember(input.toMemberId);
  if (!recipient) throw new Error("member_not_found");
  const confirmation = decideConfirmation({
    actorMemberId: input.actorMemberId,
    recipientMemberId: input.toMemberId,
    recipientConnected: isMemberConnected(recipient),
  });

  const id = generateEntityId("stl");
  await saveMutationId(room.roomId, input.clientMutationId, id);

  const settlement: DebtSettlement = {
    id,
    roomId: room.roomId,
    fromMemberId: input.fromMemberId,
    toMemberId: input.toMemberId,
    amountBase: money(input.amountBase),
    date: input.date || new Date().toISOString().slice(0, 10),
    comment: input.comment ?? null,
    createdBy: input.actorMemberId,
    createdAt: Date.now(),
    clientMutationId: input.clientMutationId ?? null,
    status: confirmation.status,
    confirmedBy: confirmation.confirmedBy,
    confirmedAt: confirmation.confirmedAt,
  };

  const ids = await listSettlementIds(room.roomId);
  ids.push(id);
  await splitRedisSet(settlementKey(id), JSON.stringify(settlement), SETTLEMENT_TTL_SEC);
  await splitRedisSet(settlementIdsKey(room.roomId), JSON.stringify(ids), SETTLEMENT_TTL_SEC);

  // Lock existing expenses
  const lockedExpenses = withExpenseLockState(expenses, [...settlements, settlement]);
  for (const e of lockedExpenses) {
    if (!e.locked) continue;
    await splitRedisSet(expenseKey(e.id), JSON.stringify({ ...e, locked: true }), EXPENSE_TTL_SEC);
  }

  await bumpRoomVersion(room.roomId);
  return settlement;
}

/** Only the recipient (toMemberId) may confirm receipt of a pending settlement. */
export async function confirmSettlement(
  roomId: string,
  settlementId: string,
  actorMemberId: string,
): Promise<DebtSettlement> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("room_not_found");

  const settlement = await splitRedisGetJson<DebtSettlement>(settlementKey(settlementId));
  if (!settlement || settlement.roomId.toUpperCase() !== room.roomId.toUpperCase()) {
    throw new Error("settlement_not_found");
  }
  if (settlement.status === "confirmed") return settlement;
  if (settlement.toMemberId !== actorMemberId) throw new Error("not_settlement_recipient");

  const confirmed: DebtSettlement = {
    ...settlement,
    status: "confirmed",
    confirmedBy: actorMemberId,
    confirmedAt: Date.now(),
  };
  await splitRedisSet(settlementKey(confirmed.id), JSON.stringify(confirmed), SETTLEMENT_TTL_SEC);
  await bumpRoomVersion(room.roomId);
  return confirmed;
}

export async function deleteSettlement(roomId: string, settlementId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const existing = await splitRedisGetJson<DebtSettlement>(settlementKey(settlementId));
  if (!existing || existing.roomId !== room.roomId) throw new Error("settlement_not_found");

  const ids = (await listSettlementIds(room.roomId)).filter((id) => id !== settlementId);
  await splitRedisDel(settlementKey(settlementId));
  await splitRedisSet(settlementIdsKey(room.roomId), JSON.stringify(ids), SETTLEMENT_TTL_SEC);

  const remaining = await listSettlements(room.roomId);
  const expenses = await listExpenses(room.roomId);
  const next = withExpenseLockState(expenses, remaining);
  for (const e of next) {
    await splitRedisSet(expenseKey(e.id), JSON.stringify(e), EXPENSE_TTL_SEC);
  }

  await bumpRoomVersion(room.roomId);
}

export async function leaveRoom(roomId: string, memberId: string): Promise<void> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("room_not_found");
  if (room.ownerMemberId === memberId) throw new Error("cannot_leave_as_owner");

  const expenses = await listExpenses(roomId);
  const settlements = await listSettlements(roomId);
  const balances = await computeEffectiveBalances({ room, expenses, settlements });
  if (!canLeaveRoom(balances, memberId)) throw new Error("nonzero_balance");

  const member = await getMember(memberId);
  if (!member) throw new Error("member_not_found");
  member.leftAt = Date.now();
  await saveMember(member);
  room.memberIds = room.memberIds.filter((id) => id !== memberId);
  await saveRoom(room);
  await bumpRoomVersion(roomId);
}

export async function archiveRoom(roomId: string, actorMemberId: string): Promise<SplitRoom> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("room_not_found");
  if (!(await canActAsOwner(room, actorMemberId))) throw new Error("forbidden");

  const expenses = await listExpenses(roomId);
  const settlements = await listSettlements(roomId);
  const balances = await computeEffectiveBalances({ room, expenses, settlements });
  if (!areBalancesSettled(balances)) throw new Error("balances_not_settled");

  room.status = "archived";
  await saveRoom(room);
  return bumpRoomVersion(roomId);
}

export async function getRoomSnapshot(roomId: string): Promise<SplitRoomSnapshot> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("room_not_found");
  const members = (await listMembers(roomId)).map(toPublicMember);
  const expenses = withExpenseLockState(await listExpenses(roomId), await listSettlements(roomId));
  const settlements = await listSettlements(roomId);
  // Ledger-aware: once advanced accounting is on, balances must also reflect money moved
  // through shared assets (contributions/withdrawals/asset-paid expenses), not just plain
  // per-member expenses — otherwise members who only interacted via the "касса" show 0.
  const balances = await computeEffectiveBalances({ room, expenses, settlements });
  const suggestions = suggestSettlements(balances);
  return {
    room,
    members,
    expenses,
    settlements,
    balances,
    suggestions,
    expensesLocked: areExpensesLocked(settlements),
    version: room.version,
  };
}

export function isSplitValidationError(err: unknown): err is SplitValidationError {
  return err instanceof SplitValidationError;
}
