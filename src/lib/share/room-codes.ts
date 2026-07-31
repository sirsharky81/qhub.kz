import { getSecureRandomInt } from "@/lib/random-picker/crypto";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const WORDS = [
  "forest",
  "river",
  "mountain",
  "cloud",
  "sunset",
  "meadow",
  "ocean",
  "breeze",
  "crystal",
  "silver",
  "golden",
  "amber",
  "coral",
  "maple",
  "cedar",
  "willow",
  "birch",
  "stone",
  "pebble",
  "stream",
  "delta",
  "summit",
  "valley",
  "harbor",
  "anchor",
  "compass",
  "signal",
  "orbit",
  "nova",
  "comet",
  "pixel",
  "vector",
  "matrix",
  "cipher",
  "bridge",
  "tunnel",
  "portal",
  "rocket",
  "planet",
  "galaxy",
] as const;

function randomAlphabetSegment(length: number): string {
  return Array.from({ length }, () => ROOM_ALPHABET[getSecureRandomInt(0, ROOM_ALPHABET.length - 1)]!).join("");
}

function generateAlphanumericCode(): string {
  return `${randomAlphabetSegment(4)}-${randomAlphabetSegment(4)}`;
}

function generateWordCode(): string {
  const w1 = WORDS[getSecureRandomInt(0, WORDS.length - 1)]!;
  let w2 = WORDS[getSecureRandomInt(0, WORDS.length - 1)]!;
  while (w2 === w1) {
    w2 = WORDS[getSecureRandomInt(0, WORDS.length - 1)]!;
  }
  const num = getSecureRandomInt(10, 99);
  return `${w1}-${w2}-${num}`;
}

export function generateRoomCode(): string {
  return getSecureRandomInt(0, 1) === 0 ? generateAlphanumericCode() : generateWordCode();
}

export function normalizeRoomCodeInput(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "");
}

export function normalizeInviteToken(input: string): string {
  return input.trim().toLowerCase();
}
