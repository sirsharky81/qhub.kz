import { ASSET_TTL_SEC, OPERATION_TTL_SEC, SUPPORTED_CURRENCIES } from "./constants";
import { d, money } from "./decimal";
import {
  canMutateRoom,
  computeAmountBase,
  normalizeShares,
  suggestSettlements,
  SplitValidationError,
} from "./engine";
import {
  foldLedger,
  operationsFromLegacy,
  ratesFx,
  type ContributionOperation,
  type CustodyHandoffOperation,
  type ExchangeOperation,
  type ExpenseOperation,
  type LedgerSnapshot,
  type RoomAsset,
  type RoomAssetKind,
  type SplitOperation,
  type TransferOperation,
  type WithdrawalOperation,
} from "./ledger";
import {
  appendOperation,
  assetIdsKey,
  assetKey,
  decideConfirmation,
  listAssetIds,
  listAssets,
  listOperations,
  opKey,
} from "./ledger-repo";
import { splitRedisGetJson, splitRedisSet } from "./redis";
import {
  bumpSplitRoomVersion,
  canActAsOwner,
  findSplitMutationId,
  getMember,
  getRoom,
  isMemberConnected,
  listExpenses,
  listMembers,
  listSettlements,
  persistSplitRoom,
  saveSplitMutationId,
} from "./store";
import { computeSplitReport, type SplitReport } from "./report";
import { generateEntityId } from "./tokens";
import type { ExpenseParticipantInput, Money, SplitMethod, SplitRoom } from "./types";

export { listAssets, listOperations } from "./ledger-repo";
export type { SplitReport } from "./report";

async function enableAdvanced(room: SplitRoom): Promise<SplitRoom> {
  if (room.advancedAccounting) return room;
  room.advancedAccounting = true;
  await persistSplitRoom(room);
  return room;
}

function assertCurrency(currency: string): string {
  const c = currency.toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(c as (typeof SUPPORTED_CURRENCIES)[number])) {
    throw new Error("unsupported_currency");
  }
  return c;
}

export async function createAsset(input: {
  roomId: string;
  actorMemberId: string;
  name: string;
  kind?: RoomAssetKind;
  currency: string;
  custodianMemberId: string;
}): Promise<RoomAsset> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const members = await listMembers(room.roomId);
  if (!members.some((m) => m.memberId === input.custodianMemberId)) {
    throw new Error("member_not_found");
  }

  const currency = assertCurrency(input.currency);
  const asset: RoomAsset = {
    id: generateEntityId("ast"),
    roomId: room.roomId,
    name: input.name.trim() || "Касса",
    kind: input.kind ?? "cash",
    currency,
    custodianMemberId: input.custodianMemberId,
    createdAt: Date.now(),
  };

  const ids = await listAssetIds(room.roomId);
  ids.push(asset.id);
  await splitRedisSet(assetKey(asset.id), JSON.stringify(asset), ASSET_TTL_SEC);
  await splitRedisSet(assetIdsKey(room.roomId), JSON.stringify(ids), ASSET_TTL_SEC);
  await enableAdvanced(room);
  await bumpSplitRoomVersion(room.roomId);
  return asset;
}

async function previewFold(
  room: SplitRoom,
  extraOps: SplitOperation[] = [],
  assetsOverride?: RoomAsset[],
): Promise<LedgerSnapshot> {
  const assets = assetsOverride ?? (await listAssets(room.roomId));
  const journalOps = await listOperations(room.roomId);
  const expenses = await listExpenses(room.roomId);
  const settlements = await listSettlements(room.roomId);
  const legacyOps = operationsFromLegacy({ expenses, settlements });
  // Stable sort: same-millisecond ops keep the true creation order already reflected
  // by [legacyOps, journalOps, extraOps] concatenation order, instead of an
  // effectively-random reshuffle by unrelated id comparison.
  const operations = [...legacyOps, ...journalOps, ...extraOps].sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  return foldLedger({
    memberIds: room.memberIds,
    assets,
    operations,
    fx: ratesFx(room.baseCurrency, room.rates),
    baseCurrency: room.baseCurrency,
  });
}

export async function getLedgerSnapshot(roomId: string): Promise<{
  room: SplitRoom;
  ledger: LedgerSnapshot;
  operations: SplitOperation[];
  suggestions: ReturnType<typeof suggestSettlements>;
}> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("room_not_found");
  const assets = await listAssets(roomId);
  const journalOps = await listOperations(roomId);
  const expenses = await listExpenses(roomId);
  const settlements = await listSettlements(roomId);
  const legacyOps = operationsFromLegacy({ expenses, settlements });
  const operations = [...legacyOps, ...journalOps].sort((a, b) => a.createdAt - b.createdAt);
  const ledger = foldLedger({
    memberIds: room.memberIds,
    assets,
    operations,
    fx: ratesFx(room.baseCurrency, room.rates),
    baseCurrency: room.baseCurrency,
  });
  const suggestions = suggestSettlements(
    ledger.members.map((m) => ({
      memberId: m.memberId,
      paidBase: m.paidBase,
      shareBase: m.shareBase,
      netBase: m.netBase,
    })),
  );
  return { room, ledger, operations, suggestions };
}

/** Spending report: totals by category + per-member paid/share/contributions/withdrawals. */
export async function getSplitReport(roomId: string): Promise<SplitReport> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("room_not_found");
  const assets = await listAssets(roomId);
  const journalOps = await listOperations(roomId);
  const expenses = await listExpenses(roomId);
  const settlements = await listSettlements(roomId);
  const legacyOps = operationsFromLegacy({ expenses, settlements });
  const operations = [...legacyOps, ...journalOps].sort((a, b) => a.createdAt - b.createdAt);
  const folded = foldLedger({
    memberIds: room.memberIds,
    assets,
    operations,
    fx: ratesFx(room.baseCurrency, room.rates),
    baseCurrency: room.baseCurrency,
  });
  return computeSplitReport({
    memberIds: room.memberIds,
    operations,
    memberBalances: folded.members,
    totalAssetsBase: folded.sumAssetBalancesBase,
  });
}

export async function createContribution(input: {
  roomId: string;
  actorMemberId: string;
  fromMemberId: string;
  toAssetId: string;
  amount: Money;
  currency?: string;
  comment?: string | null;
  clientMutationId?: string | null;
}): Promise<ContributionOperation> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const existingId = await findSplitMutationId(room.roomId, input.clientMutationId);
  if (existingId) {
    const existing = await splitRedisGetJson<ContributionOperation>(opKey(existingId));
    if (existing) return existing;
  }

  const assets = await listAssets(room.roomId);
  const asset = assets.find((a) => a.id === input.toAssetId);
  if (!asset) throw new Error("asset_not_found");

  const currency = assertCurrency(input.currency ?? asset.currency);
  if (currency !== asset.currency.toUpperCase()) throw new Error("transfer_currency_mismatch");

  const amount = money(input.amount);
  if (!d(amount).gt(0)) throw new SplitValidationError("invalid_amount");
  const amountBase = computeAmountBase(amount, currency === room.baseCurrency ? "1" : resolveRate(room, currency));

  const id = generateEntityId("op");
  await saveSplitMutationId(room.roomId, input.clientMutationId, id);

  const op: ContributionOperation = {
    id,
    roomId: room.roomId,
    type: "contribution",
    createdAt: Date.now(),
    createdBy: input.actorMemberId,
    comment: input.comment ?? null,
    clientMutationId: input.clientMutationId ?? null,
    fromMemberId: input.fromMemberId,
    toAssetId: input.toAssetId,
    amount,
    currency,
    amountBase,
  };

  // validate fold before persist
  await previewFold(room, [op], assets);

  await appendOperation(room.roomId, op);
  await enableAdvanced(room);
  await bumpSplitRoomVersion(room.roomId);
  return op;
}

function resolveRate(room: SplitRoom, currency: string): Money {
  if (currency.toUpperCase() === room.baseCurrency.toUpperCase()) return money(1);
  const found = room.rates.find((r) => r.currency.toUpperCase() === currency.toUpperCase());
  if (!found) throw new Error("missing_exchange_rate");
  return found.rate;
}

export async function createExpenseFromAsset(input: {
  roomId: string;
  actorMemberId: string;
  description: string;
  amountOriginal: Money;
  currencyOriginal: string;
  categoryId?: string;
  assetId: string;
  splitMethod: SplitMethod;
  participants: ExpenseParticipantInput[];
  comment?: string | null;
  clientMutationId?: string | null;
}): Promise<ExpenseOperation> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const existingId = await findSplitMutationId(room.roomId, input.clientMutationId);
  if (existingId) {
    const existing = await splitRedisGetJson<ExpenseOperation>(opKey(existingId));
    if (existing) return existing;
  }

  const assets = await listAssets(room.roomId);
  if (!assets.some((a) => a.id === input.assetId)) throw new Error("asset_not_found");

  const currencyOriginal = assertCurrency(input.currencyOriginal);
  const exchangeRate = resolveRate(room, currencyOriginal);
  const amountBase = computeAmountBase(input.amountOriginal, exchangeRate);
  const shares = normalizeShares({
    amountOriginal: money(input.amountOriginal),
    amountBase,
    splitMethod: input.splitMethod,
    participants: input.participants,
  });

  const id = generateEntityId("op");
  await saveSplitMutationId(room.roomId, input.clientMutationId, id);

  const op: ExpenseOperation = {
    id,
    roomId: room.roomId,
    type: "expense",
    createdAt: Date.now(),
    createdBy: input.actorMemberId,
    comment: input.comment ?? null,
    clientMutationId: input.clientMutationId ?? null,
    description: input.description.trim() || "Расход",
    amountOriginal: money(input.amountOriginal),
    currencyOriginal,
    exchangeRate,
    amountBase,
    categoryId: input.categoryId || "other",
    paymentSource: { kind: "asset", assetId: input.assetId },
    splitMethod: input.splitMethod,
    participants: shares,
  };

  await previewFold(room, [op], assets);
  await appendOperation(room.roomId, op);
  await enableAdvanced(room);
  await bumpSplitRoomVersion(room.roomId);
  return op;
}

export async function createWithdrawal(input: {
  roomId: string;
  actorMemberId: string;
  fromAssetId: string;
  toMemberId: string;
  amount: Money;
  currency?: string;
  comment?: string | null;
  clientMutationId?: string | null;
}): Promise<WithdrawalOperation> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const existingId = await findSplitMutationId(room.roomId, input.clientMutationId);
  if (existingId) {
    const existing = await splitRedisGetJson<WithdrawalOperation>(opKey(existingId));
    if (existing) return existing;
  }

  const assets = await listAssets(room.roomId);
  const asset = assets.find((a) => a.id === input.fromAssetId);
  if (!asset) throw new Error("asset_not_found");
  const currency = assertCurrency(input.currency ?? asset.currency);
  if (currency !== asset.currency.toUpperCase()) throw new Error("transfer_currency_mismatch");

  // Only whoever physically holds the cash (the asset's custodian) — or the room
  // owner, acting for a custodian who has no session of their own (a local
  // participant) — may record money leaving that asset.
  if (asset.custodianMemberId !== input.actorMemberId) {
    if (!(await canActAsOwner(room, input.actorMemberId))) {
      throw new Error("asset_custodian_required");
    }
  }

  const amount = money(input.amount);
  if (!d(amount).gt(0)) throw new SplitValidationError("invalid_amount");
  const amountBase = computeAmountBase(amount, resolveRate(room, currency));

  const recipient = await getMember(input.toMemberId);
  if (!recipient) throw new Error("member_not_found");
  const confirmation = decideConfirmation({
    actorMemberId: input.actorMemberId,
    recipientMemberId: input.toMemberId,
    recipientConnected: isMemberConnected(recipient),
  });

  const id = generateEntityId("op");
  await saveSplitMutationId(room.roomId, input.clientMutationId, id);
  const op: WithdrawalOperation = {
    id,
    roomId: room.roomId,
    type: "withdrawal",
    createdAt: Date.now(),
    createdBy: input.actorMemberId,
    comment: input.comment ?? null,
    clientMutationId: input.clientMutationId ?? null,
    fromAssetId: input.fromAssetId,
    toMemberId: input.toMemberId,
    amount,
    currency,
    amountBase,
    status: confirmation.status,
    confirmedBy: confirmation.confirmedBy,
    confirmedAt: confirmation.confirmedAt,
  };
  await previewFold(room, [op], assets);
  await appendOperation(room.roomId, op);
  await enableAdvanced(room);
  await bumpSplitRoomVersion(room.roomId);
  return op;
}

/** Only the recipient (toMemberId) may confirm receipt of a pending withdrawal. */
export async function confirmWithdrawal(
  roomId: string,
  operationId: string,
  actorMemberId: string,
): Promise<WithdrawalOperation> {
  const room = await getRoom(roomId);
  if (!room) throw new Error("room_not_found");

  const op = await splitRedisGetJson<SplitOperation>(opKey(operationId));
  if (!op || op.roomId.toUpperCase() !== room.roomId.toUpperCase() || op.type !== "withdrawal") {
    throw new Error("operation_not_found");
  }
  if (op.status === "confirmed") return op;
  if (op.toMemberId !== actorMemberId) throw new Error("not_withdrawal_recipient");

  const confirmed: WithdrawalOperation = {
    ...op,
    status: "confirmed",
    confirmedBy: actorMemberId,
    confirmedAt: Date.now(),
  };
  await splitRedisSet(opKey(confirmed.id), JSON.stringify(confirmed), OPERATION_TTL_SEC);
  await bumpSplitRoomVersion(room.roomId);
  return confirmed;
}

export async function createTransfer(input: {
  roomId: string;
  actorMemberId: string;
  fromAssetId: string;
  toAssetId: string;
  amount: Money;
  comment?: string | null;
  clientMutationId?: string | null;
}): Promise<TransferOperation> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const existingId = await findSplitMutationId(room.roomId, input.clientMutationId);
  if (existingId) {
    const existing = await splitRedisGetJson<TransferOperation>(opKey(existingId));
    if (existing) return existing;
  }

  const assets = await listAssets(room.roomId);
  const from = assets.find((a) => a.id === input.fromAssetId);
  const to = assets.find((a) => a.id === input.toAssetId);
  if (!from || !to) throw new Error("asset_not_found");
  if (from.currency.toUpperCase() !== to.currency.toUpperCase()) {
    throw new Error("transfer_currency_mismatch");
  }

  const amount = money(input.amount);
  if (!d(amount).gt(0)) throw new SplitValidationError("invalid_amount");

  const id = generateEntityId("op");
  await saveSplitMutationId(room.roomId, input.clientMutationId, id);
  const op: TransferOperation = {
    id,
    roomId: room.roomId,
    type: "transfer",
    createdAt: Date.now(),
    createdBy: input.actorMemberId,
    comment: input.comment ?? null,
    clientMutationId: input.clientMutationId ?? null,
    fromAssetId: input.fromAssetId,
    toAssetId: input.toAssetId,
    amount,
    currency: from.currency,
  };
  await previewFold(room, [op], assets);
  await appendOperation(room.roomId, op);
  await enableAdvanced(room);
  await bumpSplitRoomVersion(room.roomId);
  return op;
}

export async function createExchange(input: {
  roomId: string;
  actorMemberId: string;
  fromAssetId: string;
  fromAmount: Money;
  toAssetId: string;
  toAmount: Money;
  comment?: string | null;
  clientMutationId?: string | null;
}): Promise<ExchangeOperation> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const existingId = await findSplitMutationId(room.roomId, input.clientMutationId);
  if (existingId) {
    const existing = await splitRedisGetJson<ExchangeOperation>(opKey(existingId));
    if (existing) return existing;
  }

  const assets = await listAssets(room.roomId);
  if (!assets.some((a) => a.id === input.fromAssetId) || !assets.some((a) => a.id === input.toAssetId)) {
    throw new Error("asset_not_found");
  }
  if (!d(input.fromAmount).gt(0) || !d(input.toAmount).gt(0)) {
    throw new SplitValidationError("invalid_amount");
  }

  const id = generateEntityId("op");
  await saveSplitMutationId(room.roomId, input.clientMutationId, id);
  const op: ExchangeOperation = {
    id,
    roomId: room.roomId,
    type: "exchange",
    createdAt: Date.now(),
    createdBy: input.actorMemberId,
    comment: input.comment ?? null,
    clientMutationId: input.clientMutationId ?? null,
    fromAssetId: input.fromAssetId,
    fromAmount: money(input.fromAmount),
    toAssetId: input.toAssetId,
    toAmount: money(input.toAmount),
  };
  await previewFold(room, [op], assets);
  await appendOperation(room.roomId, op);
  await enableAdvanced(room);
  await bumpSplitRoomVersion(room.roomId);
  return op;
}

export async function createCustodyHandoff(input: {
  roomId: string;
  actorMemberId: string;
  assetId: string;
  toCustodianMemberId: string;
  comment?: string | null;
  clientMutationId?: string | null;
}): Promise<CustodyHandoffOperation> {
  const room = await getRoom(input.roomId);
  if (!room) throw new Error("room_not_found");
  if (!canMutateRoom(room)) throw new Error("room_archived");

  const existingId = await findSplitMutationId(room.roomId, input.clientMutationId);
  if (existingId) {
    const existing = await splitRedisGetJson<CustodyHandoffOperation>(opKey(existingId));
    if (existing) return existing;
  }

  const assets = await listAssets(room.roomId);
  const asset = assets.find((a) => a.id === input.assetId);
  if (!asset) throw new Error("asset_not_found");
  const members = await listMembers(room.roomId);
  if (!members.some((m) => m.memberId === input.toCustodianMemberId)) {
    throw new Error("member_not_found");
  }

  const id = generateEntityId("op");
  await saveSplitMutationId(room.roomId, input.clientMutationId, id);
  const op: CustodyHandoffOperation = {
    id,
    roomId: room.roomId,
    type: "custody_handoff",
    createdAt: Date.now(),
    createdBy: input.actorMemberId,
    comment: input.comment ?? null,
    clientMutationId: input.clientMutationId ?? null,
    assetId: input.assetId,
    toCustodianMemberId: input.toCustodianMemberId,
  };
  await previewFold(room, [op], assets);

  // Persist updated custodian on asset record for listing without fold
  asset.custodianMemberId = input.toCustodianMemberId;
  await splitRedisSet(assetKey(asset.id), JSON.stringify(asset), ASSET_TTL_SEC);

  await appendOperation(room.roomId, op);
  await enableAdvanced(room);
  await bumpSplitRoomVersion(room.roomId);
  return op;
}
