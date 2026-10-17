import { pidSupported } from "./obd2";

export type PidCategory = "engine" | "turbo" | "exhaust" | "trans" | "misc";
export type PidFuel = "any" | "diesel" | "gasoline";
export type PidPriority = 1 | 2 | 3;

/**
 * One extra Mode 01 gauge. `decode` returns null when the payload has no
 * displayable value, so the tile stays hidden. A number array is one tile per
 * sensor; NaN marks a sensor the support byte said is absent.
 */
export interface PidDef {
  pid: string;
  name_ru: string;
  name_kk: string;
  unit: string;
  bytes: number;
  /** Decimal places for the live tile. */
  digits: number;
  decode: (b: number[]) => number | number[] | null;
  category: PidCategory;
  fuel: PidFuel;
  priority: PidPriority;
}

export interface PidTile {
  label: string;
  unit: string;
  digits: number;
  value: number;
}

/** Mode 01 support pages. A PID is shown only when its page was actually read. */
export const PID_SUPPORT_PAGES = [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xc0] as const;

/** One extra PID request no more often than this. The fast gauges keep their own pace. */
export const DEFAULT_EXTRA_POLL_MS = 500;

function wordAt(bytes: number[], offset: number): number | null {
  if (bytes.length < offset + 2) return null;
  return bytes[offset]! * 256 + bytes[offset + 1]!;
}

/**
 * PID 0x78 / 0x79. Byte A is the sensor bitmap (A0..A3). Each following pair
 * is (word / 10) − 40 °C. SAE J1979, service 01.
 */
function decodeEgt(bytes: number[]): number[] | null {
  if (bytes.length < 9) return null;
  const support = bytes[0]!;
  const temps: number[] = [];
  let any = false;
  for (let sensor = 0; sensor < 4; sensor++) {
    const raw = wordAt(bytes, 1 + sensor * 2);
    const supported = (support & (1 << sensor)) !== 0 && raw != null;
    temps.push(supported ? raw! / 10 - 40 : Number.NaN);
    if (supported) any = true;
  }
  return any ? temps : null;
}

/**
 * PIDs past the generic Torque / Car Scanner Mode 01 list.
 * Left out on purpose, because the public J1979 table does not give a scale:
 * 0x9E (ТЗ said /10; the usual exhaust-flow scale is unpublished here),
 * 0x71–0x77 except boost sensor 1, 0x7A–0x7D, 0x83, 0x86, 0xA1.
 * 0x7A/0x7B are DPF pressure and status, not EGT. 0x7D is a NOx status byte.
 */
export const EXTRA_PIDS: PidDef[] = [
  {
    pid: "018E",
    name_ru: "Момент трения",
    name_kk: "Үйкеліс моменті",
    unit: "%",
    bytes: 1,
    digits: 0,
    category: "engine",
    fuel: "any",
    priority: 1,
    decode: (bytes) => (bytes.length >= 1 ? bytes[0]! - 125 : null),
  },
  {
    pid: "019D",
    name_ru: "Расход топлива двигателем",
    name_kk: "Қозғалтқыштың отын шығыны",
    unit: "г/с",
    bytes: 4,
    digits: 2,
    category: "engine",
    fuel: "any",
    priority: 1,
    // J1979-DA mass rate: 0.02 g/s per bit on bytes A,B. Bytes C,D repeat the scale for vehicle fuel rate.
    decode: (bytes) => {
      const value = wordAt(bytes, 0);
      return value == null ? null : value / 50;
    },
  },
  {
    pid: "01A2",
    name_ru: "Расход по цилиндру",
    name_kk: "Цилиндрге шаққандағы шығын",
    unit: "мг/такт",
    bytes: 2,
    digits: 1,
    category: "engine",
    fuel: "any",
    priority: 1,
    decode: (bytes) => {
      const value = wordAt(bytes, 0);
      return value == null ? null : value / 32;
    },
  },
  {
    pid: "01A4",
    name_ru: "Передаточное число",
    name_kk: "Беріліс қатынасы",
    unit: "",
    bytes: 4,
    digits: 3,
    category: "trans",
    fuel: "any",
    priority: 1,
    // Bit A1 must be set. The ratio itself is bytes C,D.
    decode: (bytes) => {
      if (bytes.length < 4 || (bytes[0]! & 0x02) === 0) return null;
      return (bytes[2]! * 256 + bytes[3]!) / 1000;
    },
  },
  {
    pid: "01A6",
    name_ru: "Одометр",
    name_kk: "Одометр",
    unit: "км",
    bytes: 4,
    digits: 1,
    category: "misc",
    fuel: "any",
    priority: 1,
    decode: (bytes) => {
      if (bytes.length < 4) return null;
      const raw = bytes[0]! * 2 ** 24 + bytes[1]! * 2 ** 16 + bytes[2]! * 2 ** 8 + bytes[3]!;
      return raw / 10;
    },
  },
  {
    pid: "0170",
    name_ru: "Давление наддува",
    name_kk: "Үрлеу қысымы",
    unit: "кПа",
    bytes: 10,
    digits: 1,
    category: "turbo",
    fuel: "any",
    priority: 2,
    // Sensor 1 is bytes D,E. 0.03125 kPa per bit (range 0…2047.97). Dividing by 0.03125 does not fit that range.
    decode: (bytes) => {
      const value = wordAt(bytes, 3);
      return value == null ? null : value * 0.03125;
    },
  },
  {
    pid: "0178",
    name_ru: "Температура выхлопа, банк 1",
    name_kk: "Пайдаланылған газ температурасы, 1-банк",
    unit: "°C",
    bytes: 9,
    digits: 0,
    category: "exhaust",
    fuel: "diesel",
    priority: 3,
    decode: decodeEgt,
  },
  {
    pid: "0179",
    name_ru: "Температура выхлопа, банк 2",
    name_kk: "Пайдаланылған газ температурасы, 2-банк",
    unit: "°C",
    bytes: 9,
    digits: 0,
    category: "exhaust",
    fuel: "diesel",
    priority: 3,
    decode: decodeEgt,
  },
];

export function tilesFromPid(def: PidDef, bytes: number[]): PidTile[] {
  const decoded = def.decode(bytes);
  if (decoded == null) return [];
  const values = typeof decoded === "number" ? [decoded] : decoded;
  const multiple = values.length > 1;
  const tiles: PidTile[] = [];
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    tiles.push({
      label: multiple ? `${def.name_ru} · ${index + 1}` : def.name_ru,
      unit: def.unit,
      digits: def.digits,
      value,
    });
  });
  return tiles;
}

/** Hide the PID when its support page is missing or the fuel type does not match. */
export function pidApplies(
  def: PidDef,
  fuel: PidFuel | null,
  bitmaps: ReadonlyMap<number, number[]>,
): boolean {
  if (def.fuel === "diesel" && fuel !== "diesel") return false;
  if (def.fuel === "gasoline" && fuel !== "gasoline") return false;
  const pid = Number.parseInt(def.pid.slice(2), 16);
  const base = pid & ~0x1f;
  return pidSupported(bitmaps.get(base), pid, base) === true;
}
