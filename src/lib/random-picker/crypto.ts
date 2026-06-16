/** Cryptographically secure random utilities — never uses Math.random() */

import { CYRILLIC_GROUP_LABELS } from "./types";

export function getSecureRandomInt(min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new RangeError("Invalid range");
  }
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  if (hi < lo) throw new RangeError("Invalid range");
  const range = hi - lo + 1;
  const maxUint32 = 0xffffffff;
  const limit = maxUint32 - (maxUint32 % range);
  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0]!;
  } while (value >= limit);
  return lo + (value % range);
}

export function getSecureRandomFloat(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / (0xffffffff + 1);
}

export async function generateSeed(): Promise<string> {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fisherYatesShuffle<T>(array: readonly T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = getSecureRandomInt(0, i);
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}

export function pickRandomOne<T>(array: readonly T[]): T {
  if (array.length === 0) throw new Error("Empty array");
  return array[getSecureRandomInt(0, array.length - 1)]!;
}

export function pickRandomMany<T>(array: readonly T[], count: number): T[] {
  if (count < 1) throw new Error("Count must be at least 1");
  if (count > array.length) throw new Error("Count exceeds array length");
  return fisherYatesShuffle(array).slice(0, count);
}

export function splitIntoGroups(participants: readonly string[], groupCount: number): string[][] {
  if (groupCount < 2) throw new Error("Need at least 2 groups");
  const shuffled = fisherYatesShuffle(participants);
  const n = shuffled.length;
  const base = Math.floor(n / groupCount);
  const remainder = n % groupCount;
  const groups: string[][] = [];
  let idx = 0;
  for (let g = 0; g < groupCount; g++) {
    const size = base + (g < remainder ? 1 : 0);
    groups.push(shuffled.slice(idx, idx + size));
    idx += size;
  }
  return groups;
}

export function getGroupLabel(index: number, customNames?: readonly string[]): string {
  const custom = customNames?.[index]?.trim();
  if (custom) return custom;
  if (index < CYRILLIC_GROUP_LABELS.length) {
    return `Группа ${CYRILLIC_GROUP_LABELS[index]}`;
  }
  return `Группа ${index + 1}`;
}

export function formatGroupsResult(
  groups: string[][],
  customNames?: readonly string[],
): string {
  return groups
    .map((g, i) => `${getGroupLabel(i, customNames)}:\n${g.join("\n")}`)
    .join("\n\n");
}

export { parseParticipants, parseParticipantsWithLimit } from "./participants";
