import type { CatalogSignal } from "@/lib/etacs-coding/diag-catalog";

export interface DecodedCatalogSignal {
  text: string;
  numeric: number | null;
}

function decodeBcd(word: number, byteLen: number): number {
  let result = 0;
  let multiplier = 1;
  const nibbles = byteLen * 2;
  let value = word >>> 0;
  for (let i = 0; i < nibbles; i++) {
    const digit = value & 0x0f;
    result += (digit <= 9 ? digit : 0) * multiplier;
    multiplier *= 10;
    value >>>= 4;
  }
  return result;
}

/**
 * Extracts raw word according to MUT-III `MutComm.dll` (`SetReceiveDataConvert` `[0x0600005F]`):
 * - `byteOrder === 1` (`CstParamTypeH.LowHigh`): Little-Endian (reverses bytes)
 * - `byteOrder === 2` (`CstParamTypeH.HighLow`) or `0`: Big-Endian
 */
function readWord(payload: number[], signal: CatalogSignal): number | null {
  const start = signal.bytePos - 1;
  if (start < 0 || signal.byteLen < 1 || start + signal.byteLen > payload.length) return null;
  let word = 0;
  if (signal.byteOrder === 1) {
    for (let index = 0; index < signal.byteLen; index++) {
      word += payload[start + index]! * 256 ** index;
    }
  } else {
    for (let index = 0; index < signal.byteLen; index++) {
      word = word * 256 + payload[start + index]!;
    }
  }
  let width = signal.byteLen * 8;
  if (signal.bitLen > 0 && signal.bitPos >= 0) {
    if (signal.bitMask != null && signal.bitMask >= 0) {
      word = word & signal.bitMask;
    }
    const mask = signal.bitLen >= 31 ? 0x7fffffff : (1 << signal.bitLen) - 1;
    word = Math.trunc(word / 2 ** signal.bitPos) & mask;
    width = signal.bitLen;
  } else if (signal.bitMask != null && signal.bitMask >= 0) {
    word = word & signal.bitMask;
  }
  if (signal.codeType === 0) {
    return decodeBcd(word, signal.byteLen);
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
  const matchedScale = signal.scales?.find((scale) => raw >= scale.lowBound && raw <= scale.upBound);
  if (matchedScale && (matchedScale.textRu || matchedScale.textEn)) {
    return { text: matchedScale.textRu || matchedScale.textEn || String(raw), numeric: raw };
  }
  const factor = matchedScale ? matchedScale.factor : signal.factor;
  const offset = matchedScale ? matchedScale.offset : signal.offset;
  const scaled = raw * factor + offset;
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
