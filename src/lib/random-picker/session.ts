export const SESSION_KEYS = {
  table: "qhub_rp_table",
  eventName: "qhub_rp_event_name",
  description: "qhub_rp_description",
  contact: "qhub_rp_contact",
  legalAccepted: "qhub_rp_legal_accepted",
  history: "qhub_rp_history",
  lastMode: "qhub_rp_last_mode",
  pickCount: "qhub_rp_pick_count",
  sequential: "qhub_rp_sequential",
  pickNumbering: "qhub_rp_pick_numbering",
} as const;

function readString(key: string): string {
  if (typeof sessionStorage === "undefined") return "";
  return sessionStorage.getItem(key) ?? "";
}

function writeString(key: string, value: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(key, value);
}

function readBool(key: string): boolean {
  return readString(key) === "true";
}

function writeBool(key: string, value: boolean): void {
  writeString(key, value ? "true" : "false");
}

export function loadEventFromSession(): {
  eventName: string;
  description: string;
  contact: string;
} {
  return {
    eventName: readString(SESSION_KEYS.eventName),
    description: readString(SESSION_KEYS.description),
    contact: readString(SESSION_KEYS.contact),
  };
}

export function saveEventToSession(event: {
  eventName: string;
  description: string;
  contact: string;
}): void {
  writeString(SESSION_KEYS.eventName, event.eventName);
  writeString(SESSION_KEYS.description, event.description);
  writeString(SESSION_KEYS.contact, event.contact);
}

export function loadTableFromSession(): string {
  return readString(SESSION_KEYS.table);
}

export function saveTableToSession(json: string): void {
  writeString(SESSION_KEYS.table, json);
}

export function loadPickCountFromSession(): number {
  const n = parseInt(readString(SESSION_KEYS.pickCount), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function savePickCountToSession(count: number): void {
  writeString(SESSION_KEYS.pickCount, String(count));
}

export function loadSequentialFromSession(): boolean {
  return readBool(SESSION_KEYS.sequential);
}

export function saveSequentialToSession(v: boolean): void {
  writeBool(SESSION_KEYS.sequential, v);
}

export function loadPickNumberingFromSession(): "asc" | "desc" {
  const v = readString(SESSION_KEYS.pickNumbering);
  return v === "desc" ? "desc" : "asc";
}

export function savePickNumberingToSession(v: "asc" | "desc"): void {
  writeString(SESSION_KEYS.pickNumbering, v);
}

export function isLegalAcceptedInSession(): boolean {
  return readBool(SESSION_KEYS.legalAccepted);
}

export function setLegalAcceptedInSession(accepted: boolean): void {
  writeBool(SESSION_KEYS.legalAccepted, accepted);
}

export function loadLastModeFromSession(): string {
  return readString(SESSION_KEYS.lastMode);
}

export function saveLastModeToSession(mode: string): void {
  writeString(SESSION_KEYS.lastMode, mode);
}
