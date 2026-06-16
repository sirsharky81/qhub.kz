import type { NumberHistoryEntry, VerificationRecord } from "./types";
import { SESSION_KEYS } from "./session";

function readSession<T>(key: string): T[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function writeSession<T>(key: string, items: T[]): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(key, JSON.stringify(items));
}

export function getOperationHistory(): VerificationRecord[] {
  return readSession<VerificationRecord>(SESSION_KEYS.history);
}

export function addOperationHistory(record: VerificationRecord): void {
  const items = getOperationHistory();
  items.unshift(record);
  writeSession(SESSION_KEYS.history, items.slice(0, 100));
}

export function clearOperationHistory(): void {
  writeSession(SESSION_KEYS.history, []);
}

const NUMBER_HISTORY_KEY = "qhub_rp_number_history";

export function getNumberHistory(): NumberHistoryEntry[] {
  return readSession<NumberHistoryEntry>(NUMBER_HISTORY_KEY);
}

export function addNumberHistory(entry: NumberHistoryEntry): void {
  const items = getNumberHistory();
  items.unshift(entry);
  writeSession(NUMBER_HISTORY_KEY, items.slice(0, 50));
}

export function clearNumberHistory(): void {
  writeSession(NUMBER_HISTORY_KEY, []);
}
