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

/** Collect hex nibbles from ELM multi-line CAN dumps. */
export function extractHexTokens(text: string): number[] {
  const tokens = text.toUpperCase().match(/\b[0-9A-F]{2}\b/g);
  if (!tokens) return [];
  return tokens.map((t) => parseInt(t, 16));
}
