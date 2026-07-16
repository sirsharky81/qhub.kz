import {
  OPERATION_TTL_SEC,
  REDIS_ASSET_IDS_PREFIX,
  REDIS_ASSET_PREFIX,
  REDIS_OP_IDS_PREFIX,
  REDIS_OP_PREFIX,
} from "./constants";
import { computeBalances } from "./engine/balance";
import { foldLedger, operationsFromLegacy, ratesFx } from "./ledger";
import type { RoomAsset, SplitOperation } from "./ledger";
import { splitRedisGetJson, splitRedisSet } from "./redis";
import type { ConfirmationStatus, DebtSettlement, MemberBalance, SplitExpense, SplitRoom } from "./types";

/**
 * Low-level asset/operation persistence, kept separate from `store.ts` and
 * `ledger-store.ts` so both can depend on it without a circular import
 * (store.ts needs effective balances; ledger-store.ts needs the raw lists).
 */

export function assetKey(id: string): string {
  return `${REDIS_ASSET_PREFIX}${id}`;
}
export function assetIdsKey(roomId: string): string {
  return `${REDIS_ASSET_IDS_PREFIX}${roomId.toUpperCase()}`;
}
export function opKey(id: string): string {
  return `${REDIS_OP_PREFIX}${id}`;
}
function opIdsKey(roomId: string): string {
  return `${REDIS_OP_IDS_PREFIX}${roomId.toUpperCase()}`;
}

export async function listAssetIds(roomId: string): Promise<string[]> {
  return (await splitRedisGetJson<string[]>(assetIdsKey(roomId))) ?? [];
}

export async function listOpIds(roomId: string): Promise<string[]> {
  return (await splitRedisGetJson<string[]>(opIdsKey(roomId))) ?? [];
}

export async function listAssets(roomId: string): Promise<RoomAsset[]> {
  const ids = await listAssetIds(roomId);
  const out: RoomAsset[] = [];
  for (const id of ids) {
    const a = await splitRedisGetJson<RoomAsset>(assetKey(id));
    if (a) out.push(a);
  }
  return out;
}

export async function listOperations(roomId: string): Promise<SplitOperation[]> {
  const ids = await listOpIds(roomId);
  const out: SplitOperation[] = [];
  for (const id of ids) {
    const op = await splitRedisGetJson<SplitOperation>(opKey(id));
    if (op) out.push(op);
  }
  return out;
}

export async function appendOperation(roomId: string, op: SplitOperation): Promise<void> {
  const ids = await listOpIds(roomId);
  ids.push(op.id);
  await splitRedisSet(opKey(op.id), JSON.stringify(op), OPERATION_TTL_SEC);
  await splitRedisSet(opIdsKey(roomId), JSON.stringify(ids), OPERATION_TTL_SEC);
}

export interface ConfirmationDecision {
  status: ConfirmationStatus;
  confirmedBy: string | null;
  confirmedAt: number | null;
}

/**
 * Acceptance decision for a money-changing-hands record (settlement / withdrawal),
 * shared between store.ts (settlements) and ledger-store.ts (withdrawals):
 *
 * - The recipient acted themselves (they're the one recording it) → auto-confirmed.
 * - The recipient is a local participant (no session of their own, can never confirm
 *   anything themselves — whoever recorded it, usually the room owner, acted for them)
 *   → auto-confirmed.
 * - Otherwise the recipient is a *connected* member who wasn't the actor → stays
 *   "pending" until they explicitly confirm receipt via a separate action.
 */
export function decideConfirmation(input: {
  actorMemberId: string;
  recipientMemberId: string;
  recipientConnected: boolean;
}): ConfirmationDecision {
  const { actorMemberId, recipientMemberId, recipientConnected } = input;
  if (actorMemberId === recipientMemberId || !recipientConnected) {
    return { status: "confirmed", confirmedBy: actorMemberId, confirmedAt: Date.now() };
  }
  return { status: "pending", confirmedBy: null, confirmedAt: null };
}

/**
 * Balances that account for the whole picture: legacy per-member expenses/settlements
 * plus (once advanced accounting is on) asset contributions, withdrawals, transfers, etc.
 *
 * Without this, `computeBalances` alone silently ignores money moved through shared
 * assets ("касса"), so members who only contributed to / paid from a shared asset would
 * incorrectly show a zero balance.
 */
export async function computeEffectiveBalances(input: {
  room: SplitRoom;
  expenses: readonly SplitExpense[];
  settlements: readonly DebtSettlement[];
  extraOps?: readonly SplitOperation[];
}): Promise<MemberBalance[]> {
  const { room, expenses, settlements, extraOps = [] } = input;
  if (!room.advancedAccounting) {
    return computeBalances(room.memberIds, expenses, settlements);
  }

  const assets = await listAssets(room.roomId);
  const journalOps = await listOperations(room.roomId);
  const legacyOps = operationsFromLegacy({ expenses, settlements });
  // Stable sort: same-millisecond ops keep the true creation order already reflected
  // by the [legacyOps, journalOps, extraOps] concatenation order.
  const operations = [...legacyOps, ...journalOps, ...extraOps].sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  const folded = foldLedger({
    memberIds: room.memberIds,
    assets,
    operations,
    fx: ratesFx(room.baseCurrency, room.rates),
    baseCurrency: room.baseCurrency,
  });
  return folded.members;
}
