/**
 * Short read-only lists from OBDb.
 * Subaru: gasoline engine service 22 on 7E0/7E8. Hybrid and charger blocks are omitted.
 * Pajero Sport 2022: Mitsubishi service 21 01–04 from the pre-2023 Triton set, 7E0/7E8.
 * Outlander 2022 29-bit headers are not included until ATSH is checked on the car.
 */

export interface ExtendedSignal {
  name: string;
  bix: number;
  len: number;
  mul: number;
  div: number;
  add: number;
  unit: string;
  digits: number;
}

export interface ExtendedCommand {
  group: "subaru" | "pajero";
  label: string;
  tx: string;
  rx: string;
  hex: string;
  signals: ExtendedSignal[];
}

function signal(
  name: string,
  unit: string,
  digits: number,
  len: number,
  extra: Partial<Pick<ExtendedSignal, "bix" | "mul" | "div" | "add">> = {},
): ExtendedSignal {
  return {
    name,
    unit,
    digits,
    len,
    bix: extra.bix ?? 0,
    mul: extra.mul ?? 1,
    div: extra.div ?? 1,
    add: extra.add ?? 0,
  };
}

export const EXTENDED_COMMANDS: ExtendedCommand[] = [
  {
    group: "subaru",
    label: "Температура ОЖ",
    tx: "7E0",
    rx: "7E8",
    hex: "22 0005",
    signals: [signal("Температура ОЖ", "°C", 0, 8, { add: -40 })],
  },
  {
    group: "subaru",
    label: "Топливо",
    tx: "7E0",
    rx: "7E8",
    hex: "22 002F",
    signals: [signal("Топливо", "%", 0, 8, { mul: 100, div: 255 })],
  },
  {
    group: "subaru",
    label: "Температура масла",
    tx: "7E0",
    rx: "7E8",
    hex: "22 10E7",
    signals: [signal("Температура масла", "°C", 0, 8, { add: -40 })],
  },
  {
    group: "subaru",
    label: "Впрыск",
    tx: "7E0",
    rx: "7E8",
    hex: "22 10A3",
    signals: [signal("Длительность впрыска", "мс", 1, 8, { mul: 32, div: 125 })],
  },
  {
    group: "subaru",
    label: "Сцепление",
    tx: "7E0",
    rx: "7E8",
    hex: "22 122F",
    signals: [signal("Педаль сцепления", "%", 0, 8, { div: 2.55 })],
  },
  {
    group: "subaru",
    label: "Тормоз",
    tx: "7E0",
    rx: "7E8",
    hex: "22 1233",
    signals: [signal("Педаль тормоза", "%", 0, 8, { div: 2.55 })],
  },
  {
    group: "pajero",
    label: "21 01",
    tx: "7E0",
    rx: "7E8",
    hex: "21 01",
    signals: [
      signal("Напряжение", "В", 1, 8, { mul: 18, div: 255 }),
      signal("Скорость", "км/ч", 0, 8, { bix: 8, mul: 2 }),
      signal("Обороты по датчику коленвала", "об/мин", 0, 16, { bix: 16, div: 8 }),
      signal("Целевые обороты холостого хода", "об/мин", 0, 8, { bix: 32, mul: 2000, div: 255 }),
    ],
  },
  {
    group: "pajero",
    label: "21 02",
    tx: "7E0",
    rx: "7E8",
    hex: "21 02",
    signals: [
      signal("Температура воздуха", "°C", 0, 8, { add: -40 }),
      signal("Температура ОЖ", "°C", 0, 8, { bix: 8, add: -40 }),
      signal("Наддув", "кПа", 0, 8, { bix: 16, mul: 1.3297 }),
    ],
  },
  {
    group: "pajero",
    label: "21 03",
    tx: "7E0",
    rx: "7E8",
    hex: "21 03",
    signals: [
      signal("Давление во впуске", "кПа", 0, 16, { div: 512 }),
      signal("Расходомер", "В", 2, 8, { bix: 16, mul: 5, div: 255 }),
      signal("Нагрузка", "%", 0, 8, { bix: 32, mul: 100, div: 255 }),
    ],
  },
  {
    group: "pajero",
    label: "21 04",
    tx: "7E0",
    rx: "7E8",
    hex: "21 04",
    signals: [
      signal("Дроссель основной", "В", 2, 8, { mul: 5, div: 255 }),
      signal("Дроссель дополнительный", "В", 2, 8, { bix: 8, mul: 5, div: 255 }),
      signal("Дроссель, цель", "В", 2, 8, { bix: 16, mul: 5, div: 255 }),
      signal("Педаль газа основная", "В", 2, 8, { bix: 24, mul: 5, div: 255 }),
      signal("Педаль газа дополнительная", "В", 2, 8, { bix: 32, mul: 5, div: 255 }),
    ],
  },
];

export interface DecodedSignal {
  name: string;
  value: string;
  unit: string;
}

function bits(data: number[], bix: number, len: number): number | null {
  if (len <= 0 || bix < 0 || bix + len > data.length * 8) return null;
  let value = 0;
  for (let offset = 0; offset < len; offset++) {
    const index = bix + offset;
    const byte = data[index >> 3]!;
    const bit = 7 - (index & 7);
    value = (value << 1) | ((byte >> bit) & 1);
  }
  return value;
}

/** `payload` is the UDS body after the positive service id, including the echoed identifier. */
export function decodeExtendedSignals(command: ExtendedCommand, payload: number[]): DecodedSignal[] {
  const echo = command.hex.replace(/[^0-9a-fA-F]/g, "").length / 2 - 1;
  const data = payload.slice(Math.max(0, echo));
  return command.signals.map((item) => {
    const raw = bits(data, item.bix, item.len);
    if (raw == null) return { name: item.name, value: "—", unit: item.unit };
    const scaled = (raw * item.mul) / item.div + item.add;
    const value = item.digits > 0 ? scaled.toFixed(item.digits) : String(Math.round(scaled));
    return { name: item.name, value, unit: item.unit };
  });
}
