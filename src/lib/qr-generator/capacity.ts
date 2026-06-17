/** Byte capacity per QR version at ECC level M (ISO/IEC 18004 byte mode). */
export const QR_BYTE_CAPACITY_M: Record<number, number> = {
  1: 14,
  2: 26,
  3: 42,
  4: 62,
  5: 84,
  6: 106,
  7: 124,
  8: 152,
  9: 180,
  10: 213,
  11: 251,
  12: 287,
  13: 331,
  14: 362,
  15: 412,
  16: 450,
  17: 504,
  18: 560,
  19: 624,
  20: 666,
  21: 711,
  22: 779,
  23: 857,
  24: 911,
  25: 997,
};

export const STORAGE_MAX_BYTES = 997;
export const INVENTORY_SOFT_MAX_BYTES = 350;
export const MINI_LABEL_MAX_VERSION = 5;
export const MINI_LABEL_MAX_BYTES = QR_BYTE_CAPACITY_M[MINI_LABEL_MAX_VERSION];

export interface CapacityInfo {
  byteLength: number;
  maxBytes: number;
  percent: number;
  qrVersion: number | null;
  overflow: boolean;
  cyrillicChars: number;
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function minQrVersionForBytes(byteLength: number): number | null {
  for (let v = 1; v <= 25; v++) {
    if (byteLength <= QR_BYTE_CAPACITY_M[v]!) return v;
  }
  return null;
}

export function getCapacityInfo(text: string, maxBytes: number): CapacityInfo {
  const byteLength = utf8ByteLength(text);
  const qrVersion = minQrVersionForBytes(byteLength);
  const overflow = byteLength > maxBytes;
  const cyrillicChars = (text.match(/[\u0400-\u04FF]/g) ?? []).length;
  return {
    byteLength,
    maxBytes,
    percent: Math.min(100, Math.round((byteLength / maxBytes) * 100)),
    qrVersion,
    overflow,
    cyrillicChars,
  };
}

export function splitStoragePayloadLines(
  lines: string[],
  maxBytes: number,
): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let header = "";

  for (const line of lines) {
    if (line.startsWith("Тип:") || line.startsWith("Название:") || line.startsWith("Номер:")) {
      header += (header ? "\n" : "") + line;
      continue;
    }
    if (line.startsWith("Расположение:") || line === "" && !current.length) {
      header += (header ? "\n" : "") + line;
      continue;
    }
    const test = [...current, line].join("\n");
    const full = header + "\n" + test;
    if (utf8ByteLength(full) > maxBytes && current.length > 0) {
      chunks.push(header + "\n" + current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) {
    chunks.push(header + "\n" + current.join("\n"));
  }
  return chunks.length ? chunks : [lines.join("\n")];
}
