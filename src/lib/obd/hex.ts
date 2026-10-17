export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/[^0-9a-fA-F]/g, "");
  if (cleaned.length % 2 !== 0) throw new Error("Нечётная длина hex");
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(data: Uint8Array, sep = " "): string {
  return Array.from(data, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(sep);
}

function bytesFromHex(hex: string, offset: number): number[] {
  const out: number[] = [];
  for (let i = offset; i + 1 < hex.length; i += 2) {
    out.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

/** Positive OBD/UDS/KWP service ids worth aligning a CAN header against. */
function responseScore(bytes: number[]): number {
  for (let i = 0; i + 1 < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x41 || b === 0x43 || b === 0x47 || b === 0x49 || b === 0x61 || b === 0x62 || b === 0x7f) return 2;
  }
  return bytes.length > 0 ? 1 : 0;
}

/**
 * ELM327 prints a long CAN reply on several lines:
 * `014` / `0: 49 02 01 34 53 34` / `1: ...` / `2: ...`.
 * The length and the `N:` indexes are not payload. Folded into the hex
 * stream they shift every following nibble.
 */
export function withoutElmLineNumbers(raw: string): string {
  return stripElmMultiline(raw).cleaned;
}

/**
 * Strips ELM multiline frame indexes (`0:`, `1:`) and extracts the declared
 * ISO-TP payload byte count when ELM printed a 3-hex-digit length header line.
 */
export function stripElmMultiline(raw: string): { cleaned: string; declaredLength: number | null } {
  const lines = raw
    .split(/\r|\n/)
    .map((line) => line.replace(/>/g, "").trim())
    .filter((line) => line.length > 0);
  const indexed = lines.filter((line) => /^[0-9A-Fa-f]+\s*:/.test(line));
  const hasLengthHeader = lines.some((line) => /^[0-9A-Fa-f]{3}$/.test(line));
  if (indexed.length < 2 && !(indexed.length >= 1 && hasLengthHeader)) {
    return { cleaned: raw, declaredLength: null };
  }

  let declaredLength: number | null = null;
  for (const line of lines) {
    if (/^[0-9A-Fa-f]+\s*:/.test(line)) break;
    if (/^[0-9A-Fa-f]{3}$/.test(line)) {
      const parsed = Number.parseInt(line, 16);
      if (Number.isFinite(parsed) && parsed > 0) {
        declaredLength = parsed;
      }
    }
  }

  const cleaned = indexed.map((line) => line.replace(/^[0-9A-Fa-f]+\s*:\s*/, "")).join(" ");
  return { cleaned, declaredLength };
}

/**
 * Bytes from an ELM line. Spaces may be off (`410C1AF8`) and a CAN id may be
 * three nibbles (`7E806410C1AF8`), so both alignments are tried.
 * Multiline `0:`, `1:` frame indexes are removed automatically.
 */
export function extractHexTokens(text: string): number[] {
  const { cleaned } = stripElmMultiline(text);
  const hex = cleaned.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (hex.length < 2) return [];
  const aligned = bytesFromHex(hex, 0);
  const shifted = bytesFromHex(hex, 1);
  return responseScore(shifted) > responseScore(aligned) ? shifted : aligned;
}
