import { extractHexTokens } from "./hex";

export interface ObdDtc {
  code: string;
  raw: number[];
}

export interface LivePidDefinition {
  pid: string;
  label: string;
  unit: string;
  /** Data bytes after the PID id in a mode 01 response. */
  bytes: number;
  digits: number;
  /** Fast gauges are read every pass. Slow ones every fourth pass. */
  pace: "fast" | "slow";
  decode: (bytes: number[]) => number | null;
}

/** SAE J1979 fuel trim: (A − 128) × 100 / 128 % */
export function decodeFuelTrimPercent(bytes: number[]): number | null {
  if (bytes.length < 1) return null;
  return ((bytes[0]! - 128) * 100) / 128;
}

function percentOf255(bytes: number[]): number | null {
  if (bytes.length < 1) return null;
  return (bytes[0]! * 100) / 255;
}

function tempOffset40(bytes: number[]): number | null {
  if (bytes.length < 1) return null;
  return bytes[0]! - 40;
}

function word(bytes: number[]): number | null {
  if (bytes.length < 2) return null;
  return bytes[0]! * 256 + bytes[1]!;
}

function gauge(
  pid: string,
  label: string,
  unit: string,
  bytes: number,
  digits: number,
  pace: "fast" | "slow",
  decode: (b: number[]) => number | null,
): LivePidDefinition {
  return { pid, label, unit, bytes, digits, pace, decode };
}

export const LIVE_PIDS: LivePidDefinition[] = [
  gauge("010C", "Обороты", "об/мин", 2, 0, "fast", (b) => {
    const value = word(b);
    return value == null ? null : value / 4;
  }),
  gauge("010D", "Скорость", "км/ч", 1, 0, "fast", (b) => (b.length >= 1 ? b[0]! : null)),
  gauge("0104", "Нагрузка", "%", 1, 0, "fast", percentOf255),
  gauge("0111", "Дроссель", "%", 1, 0, "fast", percentOf255),
  gauge("0145", "Дроссель относит.", "%", 1, 0, "slow", percentOf255),
  gauge("0149", "Педаль газа", "%", 1, 0, "fast", percentOf255),
  gauge("0105", "Темп. ОЖ", "°C", 1, 0, "slow", tempOffset40),
  gauge("010F", "Темп. всасывания", "°C", 1, 0, "slow", tempOffset40),
  gauge("015C", "Темп. масла", "°C", 1, 0, "slow", tempOffset40),
  gauge("0146", "Темп. за бортом", "°C", 1, 0, "slow", tempOffset40),
  gauge("0106", "Краткоср. коррекция (банк 1)", "%", 1, 1, "fast", decodeFuelTrimPercent),
  gauge("0107", "Долгоср. коррекция (банк 1)", "%", 1, 1, "slow", decodeFuelTrimPercent),
  gauge("0108", "Краткоср. коррекция (банк 2)", "%", 1, 1, "slow", decodeFuelTrimPercent),
  gauge("0109", "Долгоср. коррекция (банк 2)", "%", 1, 1, "slow", decodeFuelTrimPercent),
  gauge("010E", "Опережение зажигания", "°", 1, 1, "fast", (b) => (b.length >= 1 ? b[0]! / 2 - 64 : null)),
  gauge("0110", "Расход воздуха", "г/с", 2, 1, "fast", (b) => {
    const value = word(b);
    return value == null ? null : value / 100;
  }),
  gauge("010B", "Давление во впуске", "кПа", 1, 0, "fast", (b) => (b.length >= 1 ? b[0]! : null)),
  gauge("010A", "Давление топлива", "кПа", 1, 0, "slow", (b) => (b.length >= 1 ? b[0]! * 3 : null)),
  gauge("0123", "Давление в рампе", "кПа", 2, 0, "slow", (b) => {
    const value = word(b);
    return value == null ? null : value * 10;
  }),
  gauge("0144", "Смесь λ", "", 2, 3, "fast", (b) => {
    const value = word(b);
    return value == null ? null : value / 32768;
  }),
  gauge("0114", "Лямбда B1S1", "В", 2, 3, "slow", (b) => (b.length >= 1 ? b[0]! / 200 : null)),
  gauge("012F", "Топливо", "%", 1, 0, "slow", percentOf255),
  gauge("015E", "Расход топлива", "л/ч", 2, 1, "slow", (b) => {
    const value = word(b);
    return value == null ? null : value / 20;
  }),
  gauge("0142", "Напряжение ЭБУ", "В", 2, 2, "slow", (b) => {
    const value = word(b);
    return value == null ? null : value / 1000;
  }),
  gauge("0143", "Абсолютная нагрузка", "%", 2, 0, "slow", (b) => {
    const value = word(b);
    return value == null ? null : (value * 100) / 255;
  }),
  gauge("0133", "Атмосферное давление", "кПа", 1, 0, "slow", (b) => (b.length >= 1 ? b[0]! : null)),
  gauge("013C", "Темп. катализатора", "°C", 2, 0, "slow", (b) => {
    const value = word(b);
    return value == null ? null : value / 10 - 40;
  }),
  gauge("011F", "Время работы", "мин", 2, 1, "slow", (b) => {
    const value = word(b);
    return value == null ? null : value / 60;
  }),
  gauge("0121", "Пробег с ошибкой", "км", 2, 0, "slow", (b) => word(b)),
  gauge("0131", "Пробег после сброса", "км", 2, 0, "slow", (b) => word(b)),
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

/** `010C0D 1` — mode 01 PIDs, and ask ELM to return after the first ECU. */
export function formatMode01Request(pids: number[], responses = 1): string {
  const body = pids.map((pid) => pid.toString(16).padStart(2, "0").toUpperCase()).join("");
  return `01${body} ${responses.toString(16).toUpperCase()}`;
}

/**
 * Walk a mode 01 bundle (`41 0C .. 0D ..`). Stops at the next ECU's `41`
 * or at a PID that was not requested, so data lengths stay aligned.
 */
export function parseMode01Bundle(raw: string, specs: { pid: number; bytes: number }[]): Map<number, number[]> {
  const all = extractHexTokens(raw);
  const result = new Map<number, number[]>();
  const start = all.findIndex((byte, index) => byte === 0x41 && index + 1 < all.length);
  if (start < 0) return result;
  const wanted = new Map(specs.map((spec) => [spec.pid, spec.bytes]));
  let index = start + 1;
  while (index < all.length) {
    const pid = all[index]!;
    const length = wanted.get(pid);
    if (length == null || index + 1 + length > all.length) break;
    result.set(pid, all.slice(index + 1, index + 1 + length));
    index += 1 + length;
  }
  return result;
}

export function formatPidValue(value: number | null, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "—";
  return digits > 0 ? value.toFixed(digits) : String(Math.round(value));
}

/**
 * SAE J1979 support bitmap from mode 01 PID 0x00 / 0x20 / 0x40.
 * `base` is 0x00 for the 0100 response. Returns false when the ECU said the PID is absent.
 */
export function pidSupported(bitmap: number[] | undefined, pid: number, base = 0): boolean | null {
  if (!bitmap || bitmap.length < 4) return null;
  const index = pid - base;
  if (index < 1 || index > 0x20) return null;
  const byte = bitmap[(index - 1) >> 3];
  if (byte == null) return false;
  const bit = 7 - ((index - 1) & 7);
  return ((byte >> bit) & 1) === 1;
}

export function explainEmptyPidReadings(raws: string[]): string | null {
  const useful = raws.map((raw) => raw.trim()).filter((raw) => raw && raw !== "не поддерживается ECU");
  if (useful.length === 0) return "Нет ответа от адаптера на запрос параметров.";
  const compact = useful[0]!.replace(/\s+/g, " ").slice(0, 180);
  if (/Таймаут ELM/i.test(compact)) {
    return "Адаптер не успел ответить. Остановите live-параметры и снова нажмите «Подключиться к автомобилю».";
  }
  if (/NO DATA|UNABLE TO CONNECT|CAN ERROR|BUS INIT/i.test(compact)) {
    return "ЭБУ не прислал параметры (NO DATA). Включите зажигание, адаптер оставьте в разъёме OBD.";
  }
  return `Параметры не разобраны. Ответ адаптера: ${compact}`;
}
