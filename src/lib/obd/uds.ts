import { extractHexTokens } from "./hex";

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
];

export const MODULE_SCAN_ADDRESSES = [0x7e0, 0x7e1, 0x7e2, 0x7e3, 0x7e4, 0x7e5, 0x7e6, 0x7e7, 0x7df] as const;

/** Identification DIDs. 128 ids, one ECU, service 22 only. */
export const DID_SCAN_FROM = 0xf180;
export const DID_SCAN_TO = 0xf1ff;
export const DID_SCAN_SILENCE = 40;

const READ_SERVICES = new Set([
  0x10, 0x3e, 0x19, 0x21, 0x22, 0x23, 0x09, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0a,
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

/**
 * ELM327 ISO-TP text, as printed with headers off:
 * `014` then `0:62F190...` / `1:...`. Line numbers are not payload.
 * A spaced one-line reply (`62 F1 90 ...`) is accepted too.
 */
export function elmDiagnosticBytes(raw: string): number[] | null {
  const frames: string[] = [];
  const single: string[] = [];
  let declaredLen: number | null = null;
  for (const line of raw.split(/\r|\n/)) {
    const compact = line.replace(/>/g, "").replace(/\s+/g, "").toUpperCase();
    if (!compact) continue;
    const indexed = compact.match(/^[0-9A-F]:([0-9A-F]+)$/);
    if (indexed?.[1]) {
      frames.push(indexed[1]);
      continue;
    }
    if (/^[0-9A-F]{3}$/.test(compact)) {
      declaredLen = Number.parseInt(compact, 16);
      continue;
    }
    if (/^[0-9A-F]+$/.test(compact) && compact.length % 2 === 0) single.push(compact);
  }
  const hex = frames.length > 0 ? frames.join("") : single[0];
  if (!hex) return null;
  let bytes = hex.match(/../g)!.map((pair) => Number.parseInt(pair, 16));
  if (declaredLen != null && declaredLen > 0 && declaredLen < bytes.length) bytes = bytes.slice(0, declaredLen);
  return bytes;
}

function bytesForUds(raw: string, requestSid: number): number[] {
  const positive = (requestSid + 0x40) & 0xff;
  const useful = (bytes: number[] | null) =>
    Boolean(bytes?.some((byte, index) => byte === positive || (byte === 0x7f && bytes[index + 1] === requestSid)));
  const fromElm = elmDiagnosticBytes(raw);
  if (useful(fromElm)) return fromElm!;
  const tokens = extractHexTokens(raw);
  if (useful(tokens)) return tokens;
  return fromElm ?? tokens;
}

export function parseUdsResponse(raw: string, requestSid: number): UdsParsed {
  const bytes = bytesForUds(raw, requestSid);
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
      return {
        kind: "positive",
        sid: requestSid,
        payload: bytes.slice(i + 1),
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
