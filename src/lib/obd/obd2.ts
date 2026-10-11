import { extractHexTokens } from "./hex";

export interface ObdDtc {
  code: string;
  raw: number[];
}

export interface LivePidDefinition {
  pid: string;
  label: string;
  unit: string;
  decode: (bytes: number[]) => number | null;
}

/** SAE J1979 fuel trim: (A − 128) × 100 / 128 % */
export function decodeFuelTrimPercent(bytes: number[]): number | null {
  if (bytes.length < 1) return null;
  return ((bytes[0]! - 128) * 100) / 128;
}

export const LIVE_PIDS: LivePidDefinition[] = [
  {
    pid: "010C",
    label: "Обороты",
    unit: "об/мин",
    decode: (b) => (b.length >= 2 ? ((b[0] * 256 + b[1]) / 4) : null),
  },
  {
    pid: "010D",
    label: "Скорость",
    unit: "км/ч",
    decode: (b) => (b.length >= 1 ? b[0] : null),
  },
  {
    pid: "0105",
    label: "Темп. ОЖ",
    unit: "°C",
    decode: (b) => (b.length >= 1 ? b[0] - 40 : null),
  },
  {
    pid: "010F",
    label: "Темп. всасывания",
    unit: "°C",
    decode: (b) => (b.length >= 1 ? b[0] - 40 : null),
  },
  {
    pid: "0111",
    label: "Дроссель",
    unit: "%",
    decode: (b) => (b.length >= 1 ? (b[0] * 100) / 255 : null),
  },
  {
    pid: "012F",
    label: "Топливо",
    unit: "%",
    decode: (b) => (b.length >= 1 ? (b[0] * 100) / 255 : null),
  },
  {
    pid: "0104",
    label: "Нагрузка",
    unit: "%",
    decode: (b) => (b.length >= 1 ? (b[0] * 100) / 255 : null),
  },
  {
    pid: "0106",
    label: "Краткоср. коррекция (банк 1)",
    unit: "%",
    decode: decodeFuelTrimPercent,
  },
  {
    pid: "0107",
    label: "Долгоср. коррекция (банк 1)",
    unit: "%",
    decode: decodeFuelTrimPercent,
  },
  {
    pid: "0108",
    label: "Краткоср. коррекция (банк 2)",
    unit: "%",
    decode: decodeFuelTrimPercent,
  },
  {
    pid: "0109",
    label: "Долгоср. коррекция (банк 2)",
    unit: "%",
    decode: decodeFuelTrimPercent,
  },
];

const DTC_LETTERS = "PCBU";

function dtcFromTwoBytes(a: number, b: number): string {
  const type = DTC_LETTERS[(a >> 6) & 3] ?? "P";
  const d1 = ((a >> 4) & 3).toString();
  const d2 = (a & 0x0f).toString(16).toUpperCase();
  const d3 = ((b >> 4) & 0x0f).toString(16).toUpperCase();
  const d4 = (b & 0x0f).toString(16).toUpperCase();
  return `${type}${d1}${d2}${d3}${d4}`;
}

/** Parse mode 03 / 07 style response embedded in ELM text. */
export function parseDtcsFromElmResponse(raw: string): ObdDtc[] {
  const bytes = extractHexTokens(raw);
  const idx = bytes.findIndex((b) => b === 0x43 || b === 0x47 || b === 0x4a);
  if (idx < 0) {
    if (/NO DATA|UNABLE TO CONNECT|CAN ERROR/i.test(raw)) return [];
    return [];
  }
  const count = bytes[idx + 1] ?? 0;
  const payload = bytes.slice(idx + 2, idx + 2 + count * 2);
  const out: ObdDtc[] = [];
  for (let i = 0; i + 1 < payload.length; i += 2) {
    const a = payload[i]!;
    const b = payload[i + 1]!;
    if (a === 0 && b === 0) continue;
    out.push({ code: dtcFromTwoBytes(a, b), raw: [a, b] });
  }
  return out;
}

/** Parse mode 01 positive response (41 XX ...) */
export function parseMode01Pid(raw: string, pidByte: number): number[] | null {
  const bytes = extractHexTokens(raw);
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] === 0x41 && bytes[i + 1] === pidByte) {
      return bytes.slice(i + 2);
    }
  }
  return null;
}

export function formatPidValue(value: number | null, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "—";
  return digits > 0 ? value.toFixed(digits) : String(Math.round(value));
}
