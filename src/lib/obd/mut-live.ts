import type { CatalogSignal } from "@/lib/etacs-coding/diag-catalog";

export interface DecodedCatalogSignal {
  text: string;
  numeric: number | null;
}

function readWord(payload: number[], signal: CatalogSignal): number | null {
  const start = signal.bytePos - 1;
  if (start < 0 || signal.byteLen < 1 || start + signal.byteLen > payload.length) return null;
  let word = 0;
  if (signal.byteOrder === 0) {
    for (let index = 0; index < signal.byteLen; index++) {
      word = word * 256 + payload[start + index]!;
    }
  } else {
    for (let index = 0; index < signal.byteLen; index++) {
      word += payload[start + index]! * 256 ** index;
    }
  }
  let width = signal.byteLen * 8;
  if (signal.bitLen > 0 && signal.bitPos >= 0) {
    const mask = signal.bitLen >= 31 ? 0x7fffffff : (1 << signal.bitLen) - 1;
    word = Math.trunc(word / 2 ** signal.bitPos) & mask;
    width = signal.bitLen;
  }
  if (signal.signed && width > 0 && width < 32) {
    const sign = 2 ** (width - 1);
    if (word >= sign) word -= 2 ** width;
  }
  return word;
}

export function decodeCatalogSignal(signal: CatalogSignal, payload: number[]): DecodedCatalogSignal | null {
  const raw = readWord(payload, signal);
  if (raw == null) return null;
  const enumerated = signal.enums?.find((entry) => entry.value === raw);
  if (enumerated) {
    return { text: enumerated.ru || enumerated.en || String(raw), numeric: raw };
  }
  const scaled = raw * signal.factor + signal.offset;
  const digits = Math.min(Math.max(signal.decimals, 0), 6);
  return { text: scaled.toFixed(digits), numeric: scaled };
}

export function asciiFromKwpPayload(payload: number[]): string | null {
  if (payload.length < 2) return null;
  const text = payload
    .slice(1)
    .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ""))
    .join("")
    .trim();
  return text.length >= 11 ? text : null;
}
