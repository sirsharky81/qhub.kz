/**
 * Short read-only lists.
 * Subaru gasoline answers SSM address reads (`A8` + `00` + 3 address bytes) on 7E0/7E8.
 * Service 22 DIDs get no data from this ECU. Hybrid and charger blocks are omitted.
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
  /** When set, the value is that bit of the byte (7 = старший) and is shown as вкл/выкл. */
  bit?: number;
  unit: string;
  digits: number;
}

export interface ExtendedCommand {
  group: "subaru" | "pajero";
  label: string;
  tx: string;
  rx: string;
  hex: string;
  /** `none` — SSM `E8` is followed by the value. Default skips the echoed request bytes. */
  echo?: "none";
  signals: ExtendedSignal[];
}

function signal(
  name: string,
  unit: string,
  digits: number,
  len: number,
  extra: Partial<Pick<ExtendedSignal, "bix" | "mul" | "div" | "add" | "bit">> = {},
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
    bit: extra.bit,
  };
}

export const EXTENDED_COMMANDS: ExtendedCommand[] = [
  {
    group: "subaru",
    label: "Температура ОЖ",
    tx: "7E0",
    rx: "7E8",
    hex: "A8 00 00 00 08",
    echo: "none",
    signals: [signal("Температура ОЖ", "°C", 0, 8, { add: -40 })],
  },
  {
    group: "subaru",
    label: "Температура воздуха",
    tx: "7E0",
    rx: "7E8",
    hex: "A8 00 00 00 12",
    echo: "none",
    signals: [signal("Температура воздуха", "°C", 0, 8, { add: -40 })],
  },
  {
    group: "subaru",
    label: "Топливо",
    tx: "7E0",
    rx: "7E8",
    hex: "A8 00 00 00 2E",
    echo: "none",
    signals: [signal("Топливо", "В", 2, 8, { mul: 2, div: 100 })],
  },
  {
    group: "subaru",
    label: "Впрыск",
    tx: "7E0",
    rx: "7E8",
    hex: "A8 00 00 00 20",
    echo: "none",
    signals: [signal("Длительность впрыска", "мс", 1, 8, { mul: 32, div: 125 })],
  },
  {
    group: "subaru",
    label: "Сцепление",
    tx: "7E0",
    rx: "7E8",
    hex: "A8 00 00 01 21",
    echo: "none",
    signals: [signal("Педаль сцепления", "", 0, 8, { bit: 7 })],
  },
  {
    group: "subaru",
    label: "Тормоз",
    tx: "7E0",
    rx: "7E8",
    hex: "A8 00 00 01 21",
    echo: "none",
    signals: [signal("Педаль тормоза", "", 0, 8, { bit: 3 })],
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
    label: "ДВС 21 04 · Дроссель и педаль газа",
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
  {
    group: "pajero",
    label: "АКПП 21 02 · Температура и передачи (7E1→7E9)",
    tx: "7E1",
    rx: "7E9",
    hex: "21 02",
    signals: [
      signal("Обороты первичного вала АКПП", "об/мин", 0, 16, { bix: 8, div: 2 }),
      signal("Обороты выходного вала АКПП", "об/мин", 0, 16, { bix: 24, div: 2 }),
      signal("Температура масла АКПП (ATF)", "°C", 0, 8, { bix: 40, add: -40 }),
      signal("Напряжение питания TCM", "В", 1, 8, { bix: 48, mul: 33.15, div: 255 }),
      signal("Скорость по датчику АКПП", "км/ч", 0, 8, { bix: 56, mul: 714, div: 255 }),
      signal("Скольжение гидротрансформатора", "об/мин", 0, 8, { bix: 64, add: -51 }),
      signal("Передача выключена (P / N)", "", 0, 8, { bix: 72, bit: 0 }),
      signal("Задний ход (R)", "", 0, 8, { bix: 72, bit: 1 }),
    ],
  },
  {
    group: "pajero",
    label: "АКПП 21 04 · Положение селектора (7E1→7E9)",
    tx: "7E1",
    rx: "7E9",
    hex: "21 04",
    signals: [
      signal("Селектор в P (Паркинг)", "", 0, 8, { bix: 16, bit: 0 }),
      signal("Селектор в R (Задний ход)", "", 0, 8, { bix: 16, bit: 1 }),
      signal("Селектор в N (Нейтраль — выкл.)", "", 0, 8, { bix: 16, bit: 2 }),
      signal("Селектор в D (Движение)", "", 0, 8, { bix: 16, bit: 3 }),
    ],
  },
  {
    group: "pajero",
    label: "Приборка 21 A3 · Остаток топлива в баке (6A0→514)",
    tx: "6A0",
    rx: "514",
    hex: "21 A3",
    signals: [
      signal("Топливо в баке", "л", 1, 8, { bix: 16, mul: 0.7, add: -11.2 }),
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

/** `payload` is the body after the positive service id. SSM does not echo the address. */
export function decodeExtendedSignals(command: ExtendedCommand, payload: number[]): DecodedSignal[] {
  const echo = command.echo === "none" ? 0 : command.hex.replace(/[^0-9a-fA-F]/g, "").length / 2 - 1;
  const data = payload.slice(Math.max(0, echo));
  return command.signals.map((item) => {
    if (item.bit != null) {
      const byte = bits(data, item.bix, 8);
      if (byte == null) return { name: item.name, value: "—", unit: "" };
      return { name: item.name, value: ((byte >> item.bit) & 1) === 1 ? "вкл" : "выкл", unit: "" };
    }
    const raw = bits(data, item.bix, item.len);
    if (raw == null) return { name: item.name, value: "—", unit: item.unit };
    const scaled = (raw * item.mul) / item.div + item.add;
    const value = item.digits > 0 ? scaled.toFixed(item.digits) : String(Math.round(scaled));
    return { name: item.name, value, unit: item.unit };
  });
}
