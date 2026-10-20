import { extractHexTokens, stripElmMultiline } from "./hex";
import { describeDtcCode } from "./dtc-descriptions";

export interface UdsTemplate {
  id: string;
  label: string;
  hex: string;
}

export const UDS_TEMPLATES: UdsTemplate[] = [
  { id: "1001", label: "Сессия по умолчанию", hex: "10 01" },
  { id: "1003", label: "Расширенная сессия", hex: "10 03" },
  { id: "3e00", label: "TesterPresent", hex: "3E 00" },
  { id: "0904", label: "Прошивка CalID (09 04)", hex: "09 04" },
  { id: "03", label: "Ошибки блока (03)", hex: "03" },
  { id: "1902", label: "Коды DTC (UDS)", hex: "19 02 FF" },
  { id: "190a", label: "Поддержанные DTC", hex: "19 0A" },
  { id: "f18e", label: "Каталожный № Subaru (22 F18E)", hex: "22 F18E" },
  { id: "f197", label: "Имя системы (22 F197)", hex: "22 F197" },
  { id: "f190", label: "VIN (UDS)", hex: "22 F190" },
  { id: "f187", label: "Номер детали (F187)", hex: "22 F187" },
  { id: "2180", label: "KWP ID (21 80)", hex: "21 80" },
  { id: "2101", label: "Mitsubishi 21 01", hex: "21 01" },
];

export const DID_LABELS: Record<string, string> = {
  F180: "Версия загрузчика (Boot SW)",
  F181: "Идентификатор ПО (App SW)",
  F182: "Калибровка данных (Data ID)",
  F186: "Активная диагностическая сессия",
  F187: "Каталожный номер детали",
  F188: "Номер ПО ЭБУ",
  F189: "Версия ПО ЭБУ",
  F18A: "Код поставщика блока",
  F18B: "Дата производства блока",
  F18C: "Серийный номер блока",
  F18E: "Заводской номер детали (Part Number)",
  F190: "VIN автомобиля",
  F191: "Аппаратный номер ЭБУ (HW)",
  F194: "Версия ПО поставщика",
  F195: "Версия прошивки",
  F197: "Название системы / блока",
  F198: "Код сканера / сервиса (Repair Shop)",
  F199: "Дата программирования",
  "1019": "Напряжение / датчик питания (1019)",
  "101B": "Напряжение бортсети / генератора (101B)",
  "101E": "Счётчик запусков и таймер зажигания (101E)",
};

export const MODULE_DID_LABELS: Record<string, Record<string, string>> = {
  "7A2": {
    "1001": "Температура агрегата 1 (1001)",
    "1005": "Температура агрегата 2 (1005)",
    "103D": "Температура рабочей жидкости КПП/узла (103D)",
    "10CB": "Температура воздуха / контура A (10CB)",
    "10CC": "Температура контура B (10CC)",
    "1297": "Температура ДВС / масла (1297)",
    "1298": "Температура впуска / подкапотная (1298)",
    "2021": "Датчик силовой установки 1 (2021)",
    "2022": "Датчик силовой установки 2 (2022)",
    "2023": "Датчик силовой установки 3 (2023)",
    "2024": "Датчик силовой установки 4 (2024)",
    "2027": "Нагрузка / привод силовой установки (2027)",
  },
  "752": {
    "1021": "Давление шины 1 (1021)",
    "1022": "Давление шины 2 (1022)",
    "1023": "Давление шины 3 (1023)",
    "1024": "Давление шины 4 (1024)",
  },
  "783": {
    "1007": "Температура наружная / приборки (1007)",
    "1041": "Датчик уровня топлива 1 — левый полубак (1041)",
    "1042": "Датчик уровня топлива 2 — правый полубак (1042)",
    "1062": "Датчик освещённости / подсветки приборки (1062)",
  },
  "746": {
    "1006": "Крутящий момент на рулевом валу (1006)",
    "1007": "Нагрузка электроусилителя руля (1007)",
    "1041": "Угол поворота рулевого колеса (1041)",
  },
  "7B0": {
    "1001": "Давление в тормозной магистрали (1001)",
    "1006": "Продольное/поперечное ускорение G (1006)",
    "1041": "Состояние впускных клапанов ABS/VDC (1041)",
    "1042": "Клапаны / статус тормозного контура VDC (1042)",
    "200A": "Счётчик / ресурс электроручника EPB (200A)",
    "200D": "Усилие затяжки электроручника EPB (200D)",
    "2012": "Статус актуатора электроручника EPB (2012)",
  },
  "780": {
    "1007": "Внутренняя температура блока SRS (1007)",
    "1022": "Код модели блока SRS (1022)",
    "1023": "Цепь пиропатрона 1 (1023)",
    "1024": "Цепь пиропатрона 2 (1024)",
    "1026": "Цепь пиропатрона 3 (1026)",
    "1027": "Цепь пиропатрона 4 (1027)",
    "1028": "Цепь пиропатрона 5 (1028)",
    "1029": "Цепь пиропатрона 6 (1029)",
    "102C": "Цепь пиропатрона 7 (102C)",
    "102E": "Цепь преднатяжителя 1 (102E)",
    "102F": "Цепь преднатяжителя 2 (102F)",
    "1044": "Датчик ремня водителя (1044)",
    "1045": "Датчик ремня переднего пассажира (1045)",
    "1047": "Статус присутствия пассажира (1047)",
    "105F": "Серийный номер блока SRS (105F)",
  },
};

export function resolveDidLabel(didHex: string, txHex?: string): string | undefined {
  const cleanDid = didHex.toUpperCase();
  if (txHex) {
    const cleanTx = txHex.toUpperCase();
    const scoped = MODULE_DID_LABELS[cleanTx]?.[cleanDid];
    if (scoped) return scoped;
  }
  return DID_LABELS[cleanDid];
}

export const MODULE_SCAN_ADDRESSES = [0x7e0, 0x7e1, 0x7e2, 0x7e3, 0x7e4, 0x7e5, 0x7e6, 0x7e7, 0x7df] as const;

export interface KnownModuleTarget {
  tx: number;
  rx?: number;
  name: string;
  brand?: "common" | "subaru" | "mitsubishi";
}

export const KNOWN_MODULE_TARGETS: readonly KnownModuleTarget[] = [
  { tx: 0x7e0, rx: 0x7e8, name: "Двигатель (ECM)", brand: "common" },
  { tx: 0x7e1, rx: 0x7e9, name: "Коробка передач (TCM / CVT)", brand: "common" },
  { tx: 0x7a2, rx: 0x7aa, name: "Силовая установка 2.4 TURBO / КПП SGP (7A2)", brand: "subaru" },
  { tx: 0x7b0, rx: 0x7b8, name: "ABS / VDC / Ручник (EPB)", brand: "subaru" },
  { tx: 0x780, rx: 0x788, name: "Подушки SRS (Airbag)", brand: "subaru" },
  { tx: 0x783, rx: 0x78b, name: "Приборка SGP (METER 783)", brand: "subaru" },
  { tx: 0x787, rx: 0x78f, name: "Камера EyeSight SGP (787)", brand: "subaru" },
  { tx: 0x786, rx: 0x78e, name: "Сонары / Парктроник RAB (786)", brand: "subaru" },
  { tx: 0x7c4, rx: 0x7cc, name: "Климат-контроль (A/C)", brand: "subaru" },
  { tx: 0x746, rx: 0x74e, name: "Электроусилитель руля (EPS)", brand: "subaru" },
  { tx: 0x752, rx: 0x75a, name: "Боди-модуль BIU / TPMS (Integ. Unit 752)", brand: "subaru" },
  { tx: 0x7c0, rx: 0x7c8, name: "Приборная панель (Meter 7C0)", brand: "subaru" },
  { tx: 0x740, rx: 0x748, name: "Боди-модуль BIU старый (740)", brand: "subaru" },
  { tx: 0x750, rx: 0x758, name: "Шлюз / бесключевой доступ (Keyless)", brand: "subaru" },
  { tx: 0x784, rx: 0x78c, name: "Камера EyeSight / Ассистенты (784)", brand: "subaru" },
  { tx: 0x7e2, rx: 0x7ea, name: "ABS / VDC / Тормоза (7E2)", brand: "common" },
  { tx: 0x7e3, rx: 0x7eb, name: "Полный привод / 4WD (7E3)", brand: "common" },
  { tx: 0x7e4, rx: 0x7ec, name: "Кузов / Гибрид / Доп. блок (7E4)", brand: "common" },
  { tx: 0x7e5, rx: 0x7ed, name: "Шасси / Электроусилитель (7E5)", brand: "common" },
  { tx: 0x7e6, rx: 0x7ee, name: "Климат / Доп. модуль (7E6)", brand: "common" },
  { tx: 0x7e7, rx: 0x7ef, name: "Модуль 7E7", brand: "common" },
  { tx: 0x620, rx: 0x504, name: "Mitsubishi ETACS Кузов (620 → 504)", brand: "mitsubishi" },
  { tx: 0x6a0, rx: 0x514, name: "Mitsubishi Приборка Meter (6A0 → 514)", brand: "mitsubishi" },
  { tx: 0x773, rx: 0x774, name: "Mitsubishi TPMS / OSS Шины (773 → 774)", brand: "mitsubishi" },
  { tx: 0x600, rx: 0x500, name: "Mitsubishi KOS / TPMS Бесключевой (600 → 500)", brand: "mitsubishi" },
  { tx: 0x622, rx: 0x484, name: "Mitsubishi Датчик угла руля SAS (622 → 484)", brand: "mitsubishi" },
  { tx: 0x784, rx: 0x785, name: "Mitsubishi ABS / ASC / Полный привод (784 → 785)", brand: "mitsubishi" },
  { tx: 0x688, rx: 0x511, name: "Mitsubishi Климат-контроль A/C (688 → 511)", brand: "mitsubishi" },
  { tx: 0x6e0, rx: 0x51c, name: "Mitsubishi Подушки SRS Airbag (6E0 → 51C)", brand: "mitsubishi" },
  { tx: 0x796, rx: 0x797, name: "Mitsubishi Электроусилитель EPS (796 → 797)", brand: "mitsubishi" },
  { tx: 0x7a1, rx: 0x7a0, name: "Mitsubishi ETACS (7A1 → 7A0)", brand: "mitsubishi" },
  { tx: 0x710, rx: 0x718, name: "Mitsubishi ETACS / Кузов (710 → 718)", brand: "mitsubishi" },
  { tx: 0x7df, name: "Общий широковещательный (7DF)", brand: "common" },
];

const RX_MODULE_NAMES: Record<number, { name: string; tx: number }> = {
  0x7e8: { name: "Двигатель (ECM)", tx: 0x7e0 },
  0x7e9: { name: "Коробка передач (TCM / CVT)", tx: 0x7e1 },
  0x7ea: { name: "ABS / VDC / Шасси", tx: 0x7e2 },
  0x7eb: { name: "Полный привод / 4WD", tx: 0x7e3 },
  0x7ec: { name: "Кузовной / Доп. блок", tx: 0x7e4 },
  0x7ed: { name: "Рулевое / Шасси", tx: 0x7e5 },
  0x7ee: { name: "Доп. блок 7EE", tx: 0x7e6 },
  0x7ef: { name: "Доп. блок 7EF", tx: 0x7e7 },
  0x7b8: { name: "ABS / VDC / Ручник (EPB)", tx: 0x7b0 },
  0x788: { name: "Подушки SRS (Airbag)", tx: 0x780 },
  0x78b: { name: "Приборка SGP (METER 783)", tx: 0x783 },
  0x78f: { name: "Камера EyeSight SGP (787)", tx: 0x787 },
  0x78e: { name: "Сонары / Парктроник RAB (786)", tx: 0x786 },
  0x7aa: { name: "Силовая установка 2.4 TURBO / КПП SGP (7A2)", tx: 0x7a2 },
  0x7c8: { name: "Приборная панель (Meter 7C0)", tx: 0x7c0 },
  0x7cc: { name: "Климат-контроль (A/C)", tx: 0x7c4 },
  0x748: { name: "Боди-модуль BIU старый (740)", tx: 0x740 },
  0x74e: { name: "Электроусилитель руля (EPS)", tx: 0x746 },
  0x758: { name: "Шлюз / бесключевой доступ", tx: 0x750 },
  0x75a: { name: "Боди-модуль BIU / TPMS (Integ. Unit 752)", tx: 0x752 },
  0x78c: { name: "Камера EyeSight / Ассистенты (784)", tx: 0x784 },
  0x504: { name: "Mitsubishi ETACS (620 → 504)", tx: 0x620 },
  0x514: { name: "Mitsubishi Приборка Meter (6A0 → 514)", tx: 0x6a0 },
  0x774: { name: "Mitsubishi TPMS / OSS (773 → 774)", tx: 0x773 },
  0x500: { name: "Mitsubishi KOS / TPMS (600 → 500)", tx: 0x600 },
  0x484: { name: "Mitsubishi Датчик руля SAS (622 → 484)", tx: 0x622 },
  0x785: { name: "Mitsubishi ABS / ASC (784 → 785)", tx: 0x784 },
  0x511: { name: "Mitsubishi Климат A/C (688 → 511)", tx: 0x688 },
  0x51c: { name: "Mitsubishi Подушки SRS (6E0 → 51C)", tx: 0x6e0 },
  0x797: { name: "Mitsubishi EPS (796 → 797)", tx: 0x796 },
  0x7a0: { name: "Mitsubishi ETACS", tx: 0x7a1 },
  0x718: { name: "Mitsubishi ETACS / Кузов", tx: 0x710 },
};

export function describeCanModule(txOrRx: number): { name: string; txHex: string; rxHex: string } {
  const byRx = RX_MODULE_NAMES[txOrRx];
  if (byRx) {
    return {
      name: byRx.name,
      txHex: byRx.tx.toString(16).toUpperCase(),
      rxHex: txOrRx.toString(16).toUpperCase(),
    };
  }
  const known = KNOWN_MODULE_TARGETS.find((item) => item.tx === txOrRx);
  if (known) {
    const rx = known.rx ?? (txOrRx === 0x7df ? 0x7e8 : (txOrRx + 8) & 0x7ff);
    return {
      name: known.name,
      txHex: txOrRx.toString(16).toUpperCase(),
      rxHex: rx.toString(16).toUpperCase(),
    };
  }
  if (txOrRx >= 0x7e8 && txOrRx <= 0x7ef) {
    const tx = txOrRx - 8;
    return {
      name: `Блок ${txOrRx.toString(16).toUpperCase()}`,
      txHex: tx.toString(16).toUpperCase(),
      rxHex: txOrRx.toString(16).toUpperCase(),
    };
  }
  const rx = txOrRx === 0x7df ? 0x7e8 : (txOrRx + 8) & 0x7ff;
  return {
    name: `Блок ${txOrRx.toString(16).toUpperCase()}`,
    txHex: txOrRx.toString(16).toUpperCase(),
    rxHex: rx.toString(16).toUpperCase(),
  };
}

export const DID_SCAN_FROM = 0xf180;
export const DID_SCAN_TO = 0xf1ff;
export const DID_SCAN_SILENCE = 24;

const READ_SERVICES = new Set([
  0x10, 0x3e, 0x18, 0x19, 0x1a, 0x21, 0x22, 0x23, 0xa8, 0x09, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0a,
]);

const BLOCKED_SERVICES = new Set([0x11, 0x14, 0x27, 0x28, 0x2e, 0x2f, 0x31, 0x34, 0x35, 0x36, 0x37, 0x85]);

const NRC_TEXT: Record<number, string> = {
  0x10: "общий отказ",
  0x11: "сервис не поддерживается",
  0x12: "подфункция не поддерживается",
  0x13: "неверная длина",
  0x22: "условия не выполнены",
  0x31: "запрос вне диапазона",
  0x33: "защита: нет доступа",
  0x35: "неверный ключ",
  0x78: "ответ будет позже",
};

export type UdsGate =
  | { ok: true; sid: number; bytes: number[] }
  | { ok: false; message: string };

export function parseHexBytes(input: string): number[] | null {
  const cleaned = input.replace(/[^0-9a-fA-F]/g, "");
  if (cleaned.length < 2 || cleaned.length % 2 !== 0) return null;
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(Number.parseInt(cleaned.slice(i, i + 2), 16));
  }
  return bytes;
}

export function assessUdsRequest(input: string, developer: boolean): UdsGate {
  const bytes = parseHexBytes(input);
  if (!bytes || bytes.length === 0) {
    return { ok: false, message: "Запрос пустой или в нём нечётное число hex-знаков." };
  }
  const sid = bytes[0]!;
  const sub = bytes[1];
  if (sid === 0x10 && (sub === 0x02 || sub === 0x04) && !developer) {
    const subHex = sub.toString(16).padStart(2, "0");
    return {
      ok: false,
      message: `Подфункция 10 ${subHex} переводит блок в режим программирования и в обычном режиме заблокирована.`,
    };
  }
  if (BLOCKED_SERVICES.has(sid) && !developer) {
    const name = sid.toString(16).padStart(2, "0").toUpperCase();
    return {
      ok: false,
      message: `Сервис ${name} заблокирован. В обычном режиме разрешено только чтение. Включите режим разработчика и подтвердите предупреждение.`,
    };
  }
  if (!developer && !READ_SERVICES.has(sid) && !BLOCKED_SERVICES.has(sid)) {
    const name = sid.toString(16).padStart(2, "0").toUpperCase();
    return {
      ok: false,
      message: `Сервис ${name} не входит в список чтения. В обычном режиме он не отправляется.`,
    };
  }
  return { ok: true, sid, bytes };
}

export interface UdsParsed {
  kind: "positive" | "negative" | "empty";
  sid: number;
  nrc?: number;
  nrcText?: string;
  payload: number[];
  pendingOnly: boolean;
}

export function nrcText(nrc: number): string {
  return NRC_TEXT[nrc] ?? `NRC ${nrc.toString(16).padStart(2, "0").toUpperCase()}`;
}

export function parseUdsResponse(raw: string, requestSid: number): UdsParsed {
  const { declaredLength } = stripElmMultiline(raw);
  const bytes = extractHexTokens(raw);
  const positiveSid = (requestSid + 0x40) & 0xff;
  let pending = false;
  let negative: number | null = null;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x7f && bytes[i + 1] === requestSid && bytes[i + 2] != null) {
      const nrc = bytes[i + 2]!;
      if (nrc === 0x78) pending = true;
      else negative = nrc;
      i += 2;
      continue;
    }
    if (bytes[i] === positiveSid) {
      let payload = bytes.slice(i + 1);
      if (declaredLength != null && declaredLength > 1 && payload.length >= declaredLength - 1) {
        payload = payload.slice(0, declaredLength - 1);
      }
      return {
        kind: "positive",
        sid: requestSid,
        payload,
        pendingOnly: false,
      };
    }
  }
  if (negative != null) {
    return {
      kind: "negative",
      sid: requestSid,
      nrc: negative,
      nrcText: nrcText(negative),
      payload: [],
      pendingOnly: false,
    };
  }
  if (pending) {
    return {
      kind: "negative",
      sid: requestSid,
      nrc: 0x78,
      nrcText: `${nrcText(0x78)}. Адаптер уже вернул приглашение и сам закончил ожидание.`,
      payload: [],
      pendingOnly: true,
    };
  }
  return { kind: "empty", sid: requestSid, payload: [], pendingOnly: false };
}

export interface TaggedCanReply {
  rxAddress: number | null;
  parsed: UdsParsed;
}

/**
 * Parses lines returned while `ATH1 ATS1` is active (e.g. `7E8 02 7E 00` or `7E9 03 7F 3E 11`)
 * so a functional broadcast on `7DF` or a physical probe reveals the responder's CAN ID.
 */
export function parseTaggedUdsReplies(raw: string, requestSid: number): TaggedCanReply[] {
  const lines = raw
    .split(/\r|\n/)
    .map((line) => line.replace(/>/g, "").trim())
    .filter((line) => line.length > 0 && !/^(NO DATA|STOPPED|OK|SEARCHING|\?)$/i.test(line));

  const out: TaggedCanReply[] = [];
  for (const line of lines) {
    const tokens = line.toUpperCase().match(/[0-9A-F]+/g);
    if (tokens && tokens.length >= 3 && (tokens[0]!.length === 3 || tokens[0]!.length === 8)) {
      const rxAddress = Number.parseInt(tokens[0]!, 16);
      const restBytes = tokens
        .slice(1)
        .filter((tok) => tok.length === 2)
        .map((tok) => Number.parseInt(tok, 16));
      // First byte after CAN ID in ATH1+ATCAF1 is PCI length (02 7E 00)
      const bodyHex = restBytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
      const parsed = parseUdsResponse(bodyHex, requestSid);
      if (parsed.kind !== "empty") {
        out.push({ rxAddress, parsed });
        continue;
      }
    }
  }

  if (out.length > 0) return out;
  const fallback = parseUdsResponse(raw, requestSid);
  if (fallback.kind !== "empty") {
    return [{ rxAddress: null, parsed: fallback }];
  }
  return [];
}

export interface ParsedUdsDtc {
  code: string;
  statusByte: number;
  active: boolean;
  description: string;
}

export function parseUdsDtcs1902(payload: number[]): ParsedUdsDtc[] {
  if (payload.length < 2 || payload[0] !== 0x02) return [];
  const records = payload.slice(2);
  const out: ParsedUdsDtc[] = [];
  for (let i = 0; i + 3 < records.length; i += 4) {
    const b0 = records[i]!;
    const b1 = records[i + 1]!;
    const status = records[i + 3]!;
    if (b0 === 0 && b1 === 0) continue;
    const prefix = ["P", "C", "B", "U"][(b0 >> 6) & 0x03]!;
    const code = `${prefix}${(((b0 & 0x3f) << 8) | b1).toString(16).padStart(4, "0").toUpperCase()}`;
    const active = (status & 0x01) !== 0 || (status & 0x08) !== 0;
    out.push({
      code,
      statusByte: status,
      active,
      description: describeDtcCode(code),
    });
  }
  return out;
}

/**
 * Parses KWP2000 Service `18` (`18 00 FF 00`) response payload (`[count, hi, lo, status, ...]`)
 * used by Mitsubishi ETACS (`620`), Meter (`6A0`), TPMS (`773`/`600`), SAS (`622`), and ABS (`784`).
 */
export function parseKwpDtcs18(payload: number[]): ParsedUdsDtc[] {
  if (payload.length < 1) return [];
  const count = payload[0]!;
  if (count === 0 || payload.length < 4) return [];
  const records = payload.slice(1);
  const out: ParsedUdsDtc[] = [];
  for (let i = 0; i + 2 < records.length && out.length < count; i += 3) {
    const b0 = records[i]!;
    const b1 = records[i + 1]!;
    const status = records[i + 2]!;
    if (b0 === 0 && b1 === 0) continue;
    const prefix = ["P", "C", "B", "U"][(b0 >> 6) & 0x03]!;
    const code = `${prefix}${(((b0 & 0x3f) << 8) | b1).toString(16).padStart(4, "0").toUpperCase()}`;
    const active = (status & 0x20) !== 0 || (status & 0x01) !== 0 || (status & 0x40) !== 0;
    out.push({
      code,
      statusByte: status,
      active,
      description: describeDtcCode(code),
    });
  }
  return out;
}

export function formatUdsPayload(payload: number[], requestSid?: number, txHex?: string): string {
  const hex = payload.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  if (requestSid === 0x3e) {
    return `${hex} (Блок на связи — TesterPresent OK)`;
  }
  if (requestSid === 0x10 && payload.length >= 1) {
    const sub = payload[0]!;
    const sName =
      sub === 0x01
        ? "Сессия по умолчанию открыта"
        : sub === 0x03
          ? "Расширенная диагностическая сессия открыта"
          : `Сессия 0x${sub.toString(16).padStart(2, "0").toUpperCase()} открыта`;
    if (payload.length >= 5) {
      const p2 = (payload[1]! << 8) | payload[2]!;
      const p2Star = ((payload[3]! << 8) | payload[4]!) * 10;
      return `${sName} · таймаут P2=${p2} мс, P2*=${p2Star} мс (${hex})`;
    }
    return `${sName} (${hex})`;
  }
  if (requestSid === 0x18 && payload.length >= 1) {
    const dtcs = parseKwpDtcs18(payload);
    if (dtcs.length === 0) {
      return `Ошибок в блоке нет (KWP 18: 0 DTC) · [${hex}]`;
    }
    const list = dtcs.map((d) => `${d.code} (${d.active ? "активна" : "в памяти"}) — ${d.description}`);
    return `Найдено ошибок KWP (${dtcs.length}): ${list.join("; ")} · [${hex}]`;
  }
  if (requestSid === 0x1a && payload.length >= 2) {
    const lid = payload[0]!.toString(16).padStart(2, "0").toUpperCase();
    const ascii = payload
      .slice(1)
      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : " "))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    return `KWP Идентификация (1A ${lid}): ${ascii || "—"} · [${hex}]`;
  }
  if (requestSid === 0x21 && payload.length >= 2) {
    const lid = payload[0]!;
    const lidHex = lid.toString(16).padStart(2, "0").toUpperCase();
    const data = payload.slice(1);
    const cleanTx = txHex?.toUpperCase();
    if (cleanTx === "7E1" && lid === 0x02 && data.length >= 10) {
      const f = data[5]!;
      const j = data[9]!;
      const k = data[10] ?? 0;
      const atfTemp = f - 40;
      const isNeutralOrPark = (j & 0x01) !== 0;
      const isReverse = (j & 0x02) !== 0;
      let gear = 0;
      for (let g = 1; g <= 6; g++) {
        if ((j & (1 << (g + 1))) !== 0) gear = g;
      }
      if ((k & 0x01) !== 0) gear = 7;
      if ((k & 0x02) !== 0) gear = 8;
      const gearStr = isNeutralOrPark
        ? "P / N (Передача выключена)"
        : isReverse
          ? "R (Задний ход)"
          : gear > 0
            ? `${gear}-я передача`
            : "Передача разомкнута";
      return `АКПП (21 02): Темп. ATF = ${atfTemp} °C · ${gearStr} · [${hex}]`;
    }
    if (cleanTx === "6A0" && lid === 0xa3 && data.length >= 3) {
      const liters = Math.max(0, Number(((data[2]! - 16) * 0.7).toFixed(1)));
      return `Уровень топлива (21 A3): ${liters} л · [${hex}]`;
    }
    return `KWP 21 ${lidHex}: ${summarizeNumericUdsBytes(data, hex)}`;
  }
  if (requestSid === 0x19 && payload.length >= 2 && payload[0] === 0x02) {
    const dtcs = parseUdsDtcs1902(payload);
    if (dtcs.length === 0) {
      return `Ошибок в блоке нет (0 DTC) · [${hex}]`;
    }
    const list = dtcs.map((d) => `${d.code} (${d.active ? "активна" : "в памяти"}) — ${d.description}`);
    return `Найдено ошибок (${dtcs.length}): ${list.join("; ")} · [${hex}]`;
  }
  if (requestSid === 0x09 && payload.length >= 2 && payload[0] === 0x04) {
    // Mode 09 PID 04: [04, count, ...16-byte ASCII CalID blocks]
    const rawChars = payload.slice(2);
    const parts = rawChars
      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : "\0"))
      .join("")
      .split(/\0+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 3);
    if (parts.length > 0) {
      return `Калибровка (CalID): ${parts.join(" · ")} (${hex})`;
    }
  }
  if (requestSid === 0x22 && payload.length >= 3) {
    const didNum = (payload[0]! << 8) | payload[1]!;
    const didHex = payload
      .slice(0, 2)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");
    const dataBytes = payload.slice(2);
    const dataHex = dataBytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
    const label = resolveDidLabel(didHex, txHex);
    const cleanTx = txHex?.toUpperCase();
    if (isUdsBitmapDid(didNum) && dataBytes.length === 4) {
      const supported = decodeUdsDidSupportBitmap(didNum, dataBytes);
      const list =
        supported.length > 0
          ? supported.map((d) => d.toString(16).padStart(4, "0").toUpperCase()).join(", ")
          : "нет (только указатель дальше)";
      return `Карта поддерживаемых DID (${didHex}): ${dataHex} → открыты [${list}]`;
    }
    if (didHex === "101E" && dataBytes.length === 6) {
      const w0 = (dataBytes[0]! << 8) | dataBytes[1]!;
      const ticks = (dataBytes[4]! << 8) | dataBytes[5]!;
      const secs = (ticks / 10).toFixed(1);
      return `${label ? `${label}: ` : ""}${dataHex}  [запусков=${w0} · таймер зажигания=${ticks} (${secs} с)]`;
    }
    if ((didHex === "101B" || didHex === "1019") && dataBytes.length === 2) {
      const mv = (dataBytes[0]! << 8) | dataBytes[1]!;
      const voltsStr = (mv / 1000).toFixed(2);
      return `${label ? `${label}: ` : ""}${dataHex}  [${voltsStr} В (${mv} мВ)]`;
    }
    if (cleanTx === "746" && didHex === "1041" && dataBytes.length === 2) {
      const u16 = (dataBytes[0]! << 8) | dataBytes[1]!;
      const s16 = u16 >= 0x8000 ? u16 - 0x10000 : u16;
      const deg = (s16 / 10).toFixed(1);
      const dir = s16 === 0 ? "ровно 0.0°" : s16 < 0 ? `${deg}° (вправо)` : `+${deg}° (влево)`;
      return `${label ? `${label}: ` : ""}${dir}  [${dataHex} · знак=${s16}]`;
    }
    if (cleanTx === "752" && ["1021", "1022", "1023", "1024"].includes(didHex) && dataBytes.length === 1) {
      const a = dataBytes[0]!;
      const bar = (a * 0.01379).toFixed(2);
      const psi = (a * 0.2).toFixed(1);
      return `${label ? `${label}: ` : ""}${bar} бар (${psi} PSI)  [${dataHex}=${a}]`;
    }
    if (cleanTx === "783" && (didHex === "1041" || didHex === "1042") && dataBytes.length === 1) {
      const a = dataBytes[0]!;
      const pct = Math.round((a * 100) / 255);
      return `${label ? `${label}: ` : ""}${pct}%  [${dataHex}=${a}]`;
    }
    const text = dataBytes
      .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : " "))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length >= 3 && /[A-Za-z0-9]{3}/.test(text)) {
      return `${label ? `${label}: ` : ""}${text} (${dataHex})`;
    }
    return `${label ? `${label}: ` : ""}${summarizeNumericUdsBytes(dataBytes, dataHex)}`;
  }
  const text = payload
    .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : " "))
    .join("");
  const printable = text.replace(/\s+/g, " ").trim();
  if (printable.length >= 4 && /[A-Za-z0-9]{3}/.test(printable)) return `${printable} (${hex})`;
  return summarizeNumericUdsBytes(payload, hex);
}

/**
 * True when a DID is a 32-bit support bitmap header (multiple of 0x20, e.g. 1000, 1020, 1040, 1100, 2100).
 */
export function isUdsBitmapDid(did: number): boolean {
  return did >= 0x1000 && did < 0xf180 && (did & 0x1f) === 0;
}

/**
 * Decodes a 4-byte ISO/SAE-style UDS DID support bitmap (e.g. `22 1000` -> `06 00 00 F5`)
 * into the list of supported DID numbers (`baseDid + 1` .. `baseDid + 32`).
 */
export function decodeUdsDidSupportBitmap(baseDid: number, dataBytes: number[]): number[] {
  if (dataBytes.length < 4) return [];
  const out: number[] = [];
  for (let i = 0; i < 32; i++) {
    const byteIdx = i >> 3;
    const bitMask = 1 << (7 - (i & 7));
    if ((dataBytes[byteIdx]! & bitMask) !== 0) {
      out.push(baseDid + i + 1);
    }
  }
  return out;
}

/**
 * Provides Launch-style numeric interpretation hints alongside raw hex bytes
 * so live UDS DIDs (temperatures, pressures, RPM, voltages, flags) are readable immediately.
 */
export function summarizeNumericUdsBytes(payload: number[], hex?: string): string {
  const hexStr = hex ?? payload.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  if (payload.length === 0) return "пусто";
  if (payload.length === 1) {
    const a = payload[0]!;
    const temp40 = a - 40;
    const temp50 = a - 50;
    const pct = Math.round((a * 100) / 255);
    return `${hexStr}  [число=${a} · темп=${temp40}°C/${temp50}°C · ${pct}%]`;
  }
  if (payload.length === 2) {
    const u16 = (payload[0]! << 8) | payload[1]!;
    const s16 = u16 >= 0x8000 ? u16 - 0x10000 : u16;
    const div4 = (u16 / 4).toFixed(0);
    const temp10 = (u16 / 10 - 40).toFixed(1);
    return `${hexStr}  [16бит=${u16} (знак=${s16}) · /4=${div4} · темп=${temp10}°C]`;
  }
  if (payload.length <= 6) {
    const u16 = (payload[0]! << 8) | payload[1]!;
    const b0 = payload[0]!;
    const b1 = payload[1]!;
    return `${hexStr}  [B0=${b0} (${b0 - 40}°C), B1=${b1} (${b1 - 40}°C), W0=${u16}]`;
  }
  return hexStr;
}

export interface SubaruDidDiffEntry {
  txHex: string;
  moduleTitle: string;
  did: string;
  label: string;
  beforeHex: string;
  afterHex: string;
  beforeDecoded: string;
  afterDecoded: string;
}

export function diffSubaruDumps(
  before: {
    modules: {
      txHex: string;
      title: string;
      dids: { did: string; label: string; hex: string; decoded: string }[];
    }[];
  },
  after: {
    modules: {
      txHex: string;
      title: string;
      dids: { did: string; label: string; hex: string; decoded: string }[];
    }[];
  },
): SubaruDidDiffEntry[] {
  const diffs: SubaruDidDiffEntry[] = [];
  const beforeMap = new Map<string, (typeof before.modules)[number]>();
  for (const mod of before.modules) {
    beforeMap.set(mod.txHex.toUpperCase(), mod);
  }
  for (const afterMod of after.modules) {
    const tx = afterMod.txHex.toUpperCase();
    const beforeMod = beforeMap.get(tx);
    if (!beforeMod) continue;
    const beforeDids = new Map<string, (typeof beforeMod.dids)[number]>();
    for (const d of beforeMod.dids) {
      beforeDids.set(d.did.toUpperCase(), d);
    }
    for (const afterDid of afterMod.dids) {
      const didKey = afterDid.did.toUpperCase();
      const prev = beforeDids.get(didKey);
      if (!prev) continue;
      if (prev.hex.trim() !== afterDid.hex.trim()) {
        diffs.push({
          txHex: tx,
          moduleTitle: afterMod.title || beforeMod.title,
          did: didKey,
          label: afterDid.label || prev.label,
          beforeHex: prev.hex,
          afterHex: afterDid.hex,
          beforeDecoded: prev.decoded,
          afterDecoded: afterDid.decoded,
        });
      }
    }
  }
  return diffs;
}

export interface CustomDid {
  id: string;
  label: string;
  hex: string;
}

export interface UdsLogEntry {
  t: string;
  tx: string;
  rx: string;
  request: string;
  response: string;
}

const DID_KEY = "qhub.obd.custom-dids";
const LOG_KEY = "qhub.obd.uds-log";
const LOG_LIMIT = 500;

function storage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export function loadCustomDids(): CustomDid[] {
  const raw = storage()?.getItem(DID_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CustomDid[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.hex === "string" && typeof item.label === "string");
  } catch {
    return [];
  }
}

export function saveCustomDids(items: CustomDid[]): void {
  storage()?.setItem(DID_KEY, JSON.stringify(items));
}

export function loadUdsLog(): UdsLogEntry[] {
  const raw = storage()?.getItem(LOG_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as UdsLogEntry[];
    return Array.isArray(parsed) ? parsed.slice(-LOG_LIMIT) : [];
  } catch {
    return [];
  }
}

export function appendUdsLog(entry: UdsLogEntry): UdsLogEntry[] {
  const next = [...loadUdsLog(), entry].slice(-LOG_LIMIT);
  storage()?.setItem(LOG_KEY, JSON.stringify(next));
  return next;
}

export function exportUdsLog(entries: UdsLogEntry[]): string {
  const lines = ["t,tx,rx,request,response"];
  for (const entry of entries) {
    lines.push(
      [entry.t, entry.tx, entry.rx, entry.request, entry.response]
        .map((cell) => (/[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
