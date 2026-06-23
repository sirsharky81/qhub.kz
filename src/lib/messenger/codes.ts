import { getSecureRandomInt } from "@/lib/random-picker/crypto";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(length = 6): string {
  return Array.from({ length }, () => ROOM_ALPHABET[getSecureRandomInt(0, ROOM_ALPHABET.length - 1)]!).join(
    "",
  );
}

export function generateMessageId(): string {
  return crypto.randomUUID();
}
