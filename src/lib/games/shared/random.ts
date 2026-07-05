import { fisherYatesShuffle, getSecureRandomInt } from "@/lib/random-picker/crypto";

export { fisherYatesShuffle, getSecureRandomInt };

export function pickRandom<T>(items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("Cannot pick from empty array");
  }
  return items[getSecureRandomInt(0, items.length - 1)]!;
}
