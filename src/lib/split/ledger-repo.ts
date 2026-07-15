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
import type { DebtSettlement, MemberBalance, SplitExpense, SplitRoom } from "./types";

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
  const operations = [...legacyOps, ...journalOps, ...extraOps].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
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
