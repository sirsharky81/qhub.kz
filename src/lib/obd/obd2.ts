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

function signedWord(bytes: number[]): number | null {
  const value = word(bytes);
  if (value == null) return null;
  return value >= 0x8000 ? value - 0x10000 : value;
}

function narrowO2Volts(bytes: number[]): number | null {
  return bytes.length >= 1 ? bytes[0]! / 200 : null;
}

function equivalenceRatio(bytes: number[]): number | null {
  const value = word(bytes);
  return value == null ? null : value / 32768;
}

/** PID 0x34–0x3B: current sits in bytes C and D. */
function widebandCurrent(bytes: number[]): number | null {
  if (bytes.length < 4) return null;
  return (bytes[2]! * 256 + bytes[3]!) / 256 - 128;
}

function catalystTemp(bytes: number[]): number | null {
  const value = word(bytes);
  return value == null ? null : value / 10 - 40;
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
  gauge("0147", "Дроссель B", "%", 1, 0, "slow", percentOf255),
  gauge("0148", "Дроссель C", "%", 1, 0, "slow", percentOf255),
  gauge("0149", "Педаль газа", "%", 1, 0, "fast", percentOf255),
  gauge("014A", "Педаль E", "%", 1, 0, "slow", percentOf255),
  gauge("014B", "Педаль F", "%", 1, 0, "slow", percentOf255),
  gauge("014C", "Дроссель заданный", "%", 1, 0, "slow", percentOf255),
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
  gauge("0122", "Рампа к вакууму", "кПа", 2, 1, "slow", (b) => {
    const value = word(b);
    return value == null ? null : value * 0.079;
  }),
  gauge("0123", "Давление в рампе", "кПа", 2, 0, "slow", (b) => {
    const value = word(b);
    return value == null ? null : value * 10;
  }),
  gauge("0144", "Смесь λ", "", 2, 3, "fast", (b) => {
    const value = word(b);
    return value == null ? null : value / 32768;
  }),
  gauge("0114", "Лямбда B1S1", "В", 2, 3, "slow", narrowO2Volts),
  gauge("0115", "Лямбда B1S2", "В", 2, 3, "slow", narrowO2Volts),
  gauge("0116", "Лямбда B1S3", "В", 2, 3, "slow", narrowO2Volts),
  gauge("0117", "Лямбда B1S4", "В", 2, 3, "slow", narrowO2Volts),
  gauge("0118", "Лямбда B2S1", "В", 2, 3, "slow", narrowO2Volts),
  gauge("0119", "Лямбда B2S2", "В", 2, 3, "slow", narrowO2Volts),
  gauge("011A", "Лямбда B2S3", "В", 2, 3, "slow", narrowO2Volts),
  gauge("011B", "Лямбда B2S4", "В", 2, 3, "slow", narrowO2Volts),
  gauge("0124", "λ ШДК 1", "", 4, 3, "slow", equivalenceRatio),
  gauge("0125", "λ ШДК 2", "", 4, 3, "slow", equivalenceRatio),
  gauge("0126", "λ ШДК 3", "", 4, 3, "slow", equivalenceRatio),
  gauge("0127", "λ ШДК 4", "", 4, 3, "slow", equivalenceRatio),
  gauge("0128", "λ ШДК 5", "", 4, 3, "slow", equivalenceRatio),
  gauge("0129", "λ ШДК 6", "", 4, 3, "slow", equivalenceRatio),
  gauge("012A", "λ ШДК 7", "", 4, 3, "slow", equivalenceRatio),
  gauge("012B", "λ ШДК 8", "", 4, 3, "slow", equivalenceRatio),
  gauge("012C", "EGR заданный", "%", 1, 0, "slow", percentOf255),
  gauge("012D", "Ошибка EGR", "%", 1, 1, "slow", decodeFuelTrimPercent),
  gauge("012E", "Продувка адсорбера", "%", 1, 0, "slow", percentOf255),
  gauge("012F", "Топливо", "%", 1, 0, "slow", percentOf255),
  gauge("0130", "Прогревы", "", 1, 0, "slow", (b) => (b.length >= 1 ? b[0]! : null)),
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
  gauge("0132", "Давление паров", "Па", 2, 0, "slow", (b) => {
    const value = signedWord(b);
    return value == null ? null : value / 4;
  }),
  gauge("0133", "Атмосферное давление", "кПа", 1, 0, "slow", (b) => (b.length >= 1 ? b[0]! : null)),
  gauge("0134", "Ток ШДК 1", "мА", 4, 1, "slow", widebandCurrent),
  gauge("0135", "Ток ШДК 2", "мА", 4, 1, "slow", widebandCurrent),
  gauge("0136", "Ток ШДК 3", "мА", 4, 1, "slow", widebandCurrent),
  gauge("0137", "Ток ШДК 4", "мА", 4, 1, "slow", widebandCurrent),
  gauge("0138", "Ток ШДК 5", "мА", 4, 1, "slow", widebandCurrent),
  gauge("0139", "Ток ШДК 6", "мА", 4, 1, "slow", widebandCurrent),
  gauge("013A", "Ток ШДК 7", "мА", 4, 1, "slow", widebandCurrent),
  gauge("013B", "Ток ШДК 8", "мА", 4, 1, "slow", widebandCurrent),
  gauge("013C", "Темп. катализатора", "°C", 2, 0, "slow", catalystTemp),
  gauge("013D", "Катализатор B2S1", "°C", 2, 0, "slow", catalystTemp),
  gauge("013E", "Катализатор B1S2", "°C", 2, 0, "slow", catalystTemp),
  gauge("013F", "Катализатор B2S2", "°C", 2, 0, "slow", catalystTemp),
  gauge("011F", "Время работы", "мин", 2, 1, "slow", (b) => {
    const value = word(b);
    return value == null ? null : value / 60;
  }),
  gauge("0121", "Пробег с ошибкой", "км", 2, 0, "slow", (b) => word(b)),
  gauge("0131", "Пробег после сброса", "км", 2, 0, "slow", (b) => word(b)),
  gauge("014D", "Время с ошибкой", "мин", 2, 0, "slow", (b) => word(b)),
  gauge("014E", "Время после сброса", "мин", 2, 0, "slow", (b) => word(b)),
  gauge("0152", "Этанол", "%", 1, 0, "slow", percentOf255),
  gauge("0153", "Пары абсолютные", "кПа", 2, 2, "slow", (b) => {
    const value = word(b);
    return value == null ? null : value / 200;
  }),
  gauge("0154", "Давление паров B", "Па", 2, 0, "slow", (b) => {
    const value = word(b);
    return value == null ? null : value - 32767;
  }),
  gauge("0155", "Краткоср. доп. O2 (банк 1)", "%", 2, 1, "slow", decodeFuelTrimPercent),
  gauge("0156", "Долгоср. доп. O2 (банк 1)", "%", 2, 1, "slow", decodeFuelTrimPercent),
  gauge("0157", "Краткоср. доп. O2 (банк 2)", "%", 2, 1, "slow", decodeFuelTrimPercent),
  gauge("0158", "Долгоср. доп. O2 (банк 2)", "%", 2, 1, "slow", decodeFuelTrimPercent),
  gauge("0159", "Рампа абсолютная", "кПа", 2, 0, "slow", (b) => {
    const value = word(b);
    return value == null ? null : value * 10;
  }),
  gauge("015A", "Педаль относит.", "%", 1, 0, "slow", percentOf255),
  gauge("015B", "Батарея гибрида", "%", 1, 0, "slow", percentOf255),
  gauge("015D", "Угол впрыска", "°", 2, 1, "slow", (b) => {
    const value = word(b);
    return value == null ? null : (value - 26880) / 128;
  }),
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
 * Walk a mode 01 bundle. ELM often prints each PID as its own `41 XX` line.
 * A repeated `41` continues the same reply when the next PID was requested and
 * is still missing. The same PID a second time is another ECU, so the walk stops.
 */
export function parseMode01Bundle(raw: string, specs: { pid: number; bytes: number }[]): Map<number, number[]> {
  const all = extractHexTokens(raw);
  const result = new Map<number, number[]>();
  const wanted = new Map(specs.map((spec) => [spec.pid, spec.bytes]));
  let index = all.findIndex((byte, at) => byte === 0x41 && wanted.has(all[at + 1] ?? -1));
  if (index < 0) return result;
  index += 1;
  while (index < all.length) {
    if (all[index] === 0x41) {
      const next = all[index + 1];
      if (next != null && wanted.has(next) && !result.has(next)) {
        index += 1;
        continue;
      }
      break;
    }
    const pid = all[index]!;
    const length = wanted.get(pid);
    if (length == null || index + 1 + length > all.length) break;
    result.set(pid, all.slice(index + 1, index + 1 + length));
    index += 1 + length;
  }
  return result;
}

/** Mode 02: `42 PID frame data...`. The frame byte sits between the PID and the value. */
export function parseMode02Pid(raw: string, pidByte: number): number[] | null {
  const bytes = extractHexTokens(raw);
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 0x42 && bytes[i + 1] === pidByte) return bytes.slice(i + 3);
  }
  return null;
}

export function freezeFrameDtc(bytes: number[] | null): string | null {
  if (!bytes || bytes.length < 2 || (bytes[0] === 0 && bytes[1] === 0)) return null;
  return dtcFromTwoBytes(bytes[0]!, bytes[1]!);
}

const CONTINUOUS_MONITORS = [
  { name: "Пропуски воспламенения", supportBit: 0, incompleteBit: 4 },
  { name: "Топливная система", supportBit: 1, incompleteBit: 5 },
  { name: "Компоненты", supportBit: 2, incompleteBit: 6 },
];

const SPARK_MONITORS = [
  "Катализатор",
  "Подогрев катализатора",
  "Пары топлива",
  "Вторичный воздух",
  null,
  "Датчик кислорода",
  "Нагреватель датчика кислорода",
  "EGR / фазы ГРМ",
];

const COMPRESSION_MONITORS = [
  "Катализатор NMHC",
  "Нейтрализация NOx",
  null,
  "Наддув",
  null,
  "Датчик выхлопа",
  "Сажевый фильтр",
  "EGR / фазы ГРМ",
];

export interface ReadinessReport {
  mil: boolean;
  dtcCount: number;
  ignition: "бензин" | "дизель";
  lines: string[];
}

/** SAE J1979 PID 0101. Incomplete bits are 1 when the monitor has not finished. */
export function parseReadiness(raw: string): ReadinessReport | null {
  const data = parseMode01Pid(raw, 0x01);
  if (!data || data.length < 4) return null;
  const status = data[0]!;
  const continuous = data[1]!;
  const available = data[2]!;
  const incomplete = data[3]!;
  const compression = (continuous & 0x08) !== 0;
  const lines: string[] = [];
  for (const item of CONTINUOUS_MONITORS) {
    if ((continuous & (1 << item.supportBit)) === 0) continue;
    const ready = (continuous & (1 << item.incompleteBit)) === 0;
    lines.push(`${item.name}: ${ready ? "готово" : "не готово"}`);
  }
  const named = compression ? COMPRESSION_MONITORS : SPARK_MONITORS;
  for (let bit = 0; bit < named.length; bit++) {
    const name = named[bit];
    if (!name || (available & (1 << bit)) === 0) continue;
    const ready = (incomplete & (1 << bit)) === 0;
    lines.push(`${name}: ${ready ? "готово" : "не готово"}`);
  }
  return {
    mil: (status & 0x80) !== 0,
    dtcCount: status & 0x7f,
    ignition: compression ? "дизель" : "бензин",
    lines,
  };
}

function mode09Chunks(raw: string, pid: number): number[][] {
  const bytes = extractHexTokens(raw);
  const chunks: number[][] = [];
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] !== 0x49 || bytes[i + 1] !== pid) continue;
    const chunk: number[] = [];
    let cursor = i + 2;
    while (cursor < bytes.length && !(bytes[cursor] === 0x49 && bytes[cursor + 1] === pid)) {
      chunk.push(bytes[cursor]!);
      cursor++;
    }
    if (chunk.length > 0) chunks.push(chunk);
    i = cursor - 1;
  }
  return chunks;
}

function asciiFromBytes(bytes: number[]): string | null {
  const text = bytes
    .filter((byte) => byte >= 0x20 && byte <= 0x7e)
    .map((byte) => String.fromCharCode(byte))
    .join("")
    .trim();
  return text.length >= 4 ? text : null;
}

/** Mode 09 VIN (02) and calibration id (04). Drops the leading item-count byte on CAN. */
export function parseMode09Ascii(raw: string, pid: number): string | null {
  const chunks = mode09Chunks(raw, pid);
  if (chunks.length === 0) return null;
  if (chunks.length === 1) {
    const only = chunks[0]!;
    const body = only[0] != null && only[0] < 0x20 ? only.slice(1) : only;
    return asciiFromBytes(body);
  }
  const ordered = [...chunks].sort((left, right) => (left[0] ?? 0) - (right[0] ?? 0));
  return asciiFromBytes(ordered.flatMap((chunk) => chunk.slice(1)));
}

/** Mode 09 CVN (06): groups of four bytes, shown as hex. */
export function parseMode09Cvn(raw: string): string | null {
  const chunks = mode09Chunks(raw, 0x06);
  if (chunks.length === 0) return null;
  let data = chunks.length === 1 ? chunks[0]! : chunks.flatMap((chunk) => chunk.slice(1));
  if (chunks.length === 1 && data[0] != null && data[0] <= 8 && data.length > 4) data = data.slice(1);
  const groups: string[] = [];
  for (let i = 0; i + 3 < data.length; i += 4) {
    const group = data.slice(i, i + 4);
    if (group.every((byte) => byte === 0)) continue;
    groups.push(group.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(""));
  }
  return groups.length > 0 ? groups.join(" ") : null;
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
