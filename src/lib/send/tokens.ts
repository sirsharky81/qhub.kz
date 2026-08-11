import { randomBytes } from "node:crypto";
import { SHARE_ID_ALPHABET, SHARE_ID_LENGTH } from "./constants";

/** Short public id for /s/{shareId} — avoids ambiguous chars (0/O, 1/l/I). */
export function generateShareId(): string {
  const bytes = randomBytes(SHARE_ID_LENGTH);
  return Array.from(bytes, (b) => SHARE_ID_ALPHABET[b % SHARE_ID_ALPHABET.length]).join("");
}
