import { getSecureRandomInt } from "@/lib/random-picker/crypto";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(length = 6): string {
  return Array.from({ length }, () => ROOM_ALPHABET[getSecureRandomInt(0, ROOM_ALPHABET.length - 1)]!).join(
    "",
  );
}

export function generateJoinCode(length = 8): string {
  return generateRoomCode(length);
}

export function generateSecret(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
