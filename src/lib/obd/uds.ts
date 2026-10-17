import { extractHexTokens, stripElmMultiline } from "./hex";

export interface UdsTemplate {
  id: string;
  label: string;
  hex: string;
}

export const UDS_TEMPLATES: UdsTemplate[] = [
  { id: "1001", label: "Сессия по умолчанию", hex: "10 01" },
  { id: "1003", label: "Расширенная сессия", hex: "10 03" },
  { id: "3e00", label: "TesterPresent", hex: "3E 00" },
  { id: "1902", label: "Коды DTC", hex: "19 02 FF" },
  { id: "190a", label: "Поддержанные DTC", hex: "19 0A" },
  { id: "f190", label: "VIN", hex: "22 F190" },
  { id: "f187", label: "Номер детали", hex: "22 F187" },
  { id: "f18c", label: "Серийный номер", hex: "22 F18C" },
  { id: "2180", label: "KWP ID (21 80)", hex: "21 80" },
];

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
  { tx: 0x7e2, rx: 0x7ea, name: "ABS / VDC / Тормоза", brand: "common" },
  { tx: 0x7e3, rx: 0x7eb, name: "Полный привод / 4WD", brand: "common" },
  { tx: 0x7e4, rx: 0x7ec, name: "Кузов / Гибрид / Доп. блок", brand: "common" },
  { tx: 0x7e5, rx: 0x7ed, name: "Шасси / Электроусилитель", brand: "common" },
  { tx: 0x7e6, rx: 0x7ee, name: "Климат / Доп. модуль", brand: "common" },
  { tx: 0x7e7, rx: 0x7ef, name: "Модуль 7E7", brand: "common" },
  { tx: 0x7b0, rx: 0x7b8, name: "ABS / VDC (Subaru / Mitsubishi)", brand: "subaru" },
  { tx: 0x780, rx: 0x788, name: "Подушки SRS / Приборка", brand: "subaru" },
  { tx: 0x7c0, rx: 0x7c8, name: "Приборная панель / Боди", brand: "subaru" },
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
  0x7b8: { name: "ABS / VDC", tx: 0x7b0 },
  0x788: { name: "Подушки SRS / Приборка", tx: 0x780 },
  0x7c8: { name: "Приборная панель / Боди", tx: 0x7c0 },
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
  0x10, 0x3e, 0x19, 0x21, 0x22, 0x23, 0xa8, 0x09, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0a,
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

export function formatUdsPayload(payload: number[]): string {
  const hex = payload.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  const text = payload
    .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ""))
    .join("");
  const printable = text.replace(/\0/g, "").trim();
  if (printable.length >= 4 && printable.length >= payload.length / 2) return `${hex} (${printable})`;
  return hex;
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
