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
    if (b === 0x41 || b === 0x43 || b === 0x47 || b === 0x49 || b === 0x61 || b === 0x62) return 2;
  }
  return bytes.length > 0 ? 1 : 0;
}

/**
 * Bytes from an ELM line. Spaces may be off (`410C1AF8`) and a CAN id may be
 * three nibbles (`7E806410C1AF8`), so both alignments are tried.
 */
export function extractHexTokens(text: string): number[] {
  const hex = text.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (hex.length < 2) return [];
  const aligned = bytesFromHex(hex, 0);
  const shifted = bytesFromHex(hex, 1);
  return responseScore(shifted) > responseScore(aligned) ? shifted : aligned;
}
