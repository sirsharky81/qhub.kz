/** Mitsubishi TPMS registration frames. No adapter imports: the API and the UI can share this. */

export const TPMS_REGISTRATION_WINDOW_MS = 20 * 60 * 1000;

const REGISTRATION_TX = new Set([0x773, 0x600, 0x620, 0x7a1]);

/** Start bytes verified from MUT fid 1908 / 11108 after qualifiers were read inside each skey. */
const ROUTINE_START = /^31(?:2B|2C|A2|AD|AE)(?:00|01|06|07)$/;
const ROUTINE_POLL = /^32(?:2B|2C|A2|AD|AE)$/;
const RECEPTION_READ = /^21(?:2[3-7]|3[6-9A]|A[1-6]|AE|28)$/;
const DID_READ = /^22104[1-4]$/;
const DID_WRITE = /^2E104[1-4][0-9A-F]{8}$/;
const BLANK_ID = /^(?:00000000|FFFFFFFF)$/;

const WHEEL_ORDER = ["FL", "FR", "RR", "RL"] as const;

export type TpmsRoutineMethod = "pressure" | "tool" | "custom";

export interface TpmsRoutineMode {
  id: string;
  set: 1 | 2;
  wheels: 4 | 5;
  method: TpmsRoutineMethod;
  nameRu: string;
  startRequest: string;
  pollRequest: string;
}

export interface TpmsDidWheel {
  position: string;
  labelRu: string;
  readRequest: string;
  writePrefix: string;
}

export interface TpmsRoutineRecipe {
  kind: "routine";
  skey: string;
  modes: TpmsRoutineMode[];
  receptionLids: string[];
}

export interface TpmsDidRecipe {
  kind: "did";
  skey: string;
  wheels: TpmsDidWheel[];
}

export type TpmsRegistrationRecipe = TpmsRoutineRecipe | TpmsDidRecipe;

export type TpmsReceptionState = "waiting" | "received" | "unknown";

export interface TpmsReceptionFlag {
  lid: string;
  state: TpmsReceptionState;
}

export interface TpmsRoutineProgress {
  elapsedMs: number;
  remainingMs: number;
  reception: TpmsReceptionFlag[];
  ids: (string | null)[];
}

export interface TpmsRoutineResult extends TpmsRoutineProgress {
  status: "accepted" | "timeout" | "stopped";
  noteRu: string;
}

export interface TpmsDidWrite {
  position: string;
  labelRu: string;
  request: string;
  id: string;
}

export function compactHex(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function registrationFrameAllowed(request: string): boolean {
  const hex = compactHex(request);
  if (DID_WRITE.test(hex)) return !BLANK_ID.test(hex.slice(6));
  return ROUTINE_START.test(hex) || ROUTINE_POLL.test(hex) || RECEPTION_READ.test(hex) || DID_READ.test(hex);
}

export function assertRegistrationTx(tx: number): void {
  if (!REGISTRATION_TX.has(tx)) {
    throw new Error("Прописка TPMS идёт только на адреса 773, 600, 620 и 7A1");
  }
}

export function parseRegistrationAddress(value: string): number | null {
  const hex = value.trim().replace(/^0x/i, "");
  if (!/^[0-9A-Fa-f]{1,3}$/.test(hex)) return null;
  const id = Number.parseInt(hex, 16);
  return REGISTRATION_TX.has(id) ? id : null;
}

function belongsToRecipe(recipe: TpmsRegistrationRecipe, hex: string): boolean {
  if (recipe.kind === "routine") {
    for (const mode of recipe.modes) {
      if (hex === mode.startRequest || hex === mode.pollRequest) return true;
    }
    if (hex === "2128" || hex === "21A6" || hex === "21AE") return true;
    return recipe.receptionLids.some((lid) => hex === `21${lid}`);
  }
  for (const wheel of recipe.wheels) {
    if (hex === wheel.readRequest) return true;
    if (hex.startsWith(wheel.writePrefix) && hex.length === wheel.writePrefix.length + 8) return true;
  }
  return false;
}

export function assertRegistrationFrame(recipe: TpmsRegistrationRecipe, request: string): string {
  const hex = compactHex(request);
  if (!registrationFrameAllowed(hex) || !belongsToRecipe(recipe, hex)) {
    throw new Error("Кадр не входит в прописку этого блока");
  }
  return hex;
}

export function assertSensorId(value: string): string {
  const id = compactHex(value);
  if (BLANK_ID.test(id)) {
    throw new Error("Пустой ID 00000000 и FFFFFFFF не отправляются");
  }
  if (!/^[0-9A-F]{8}$/.test(id)) {
    throw new Error("ID датчика — 8 hex-символов");
  }
  return id;
}

/**
 * MUT Data List bytePos 2. `extractKwp21Data` already drops `61` and the LID,
 * so the reception flag is the first remaining byte. `00` is still waiting, `FF` is unknown.
 */
export function tpmsReceptionState(dataAfterLid: number[] | null | undefined): TpmsReceptionState {
  const flag = dataAfterLid?.[0];
  if (flag == null || flag === 0x00) return "waiting";
  if (flag === 0xff) return "unknown";
  return "received";
}

/**
 * Up to five 4-byte sensor IDs from KWP `21 28` / `21 A6` (`bytePos = 3, 7, 11, 15, 19`, 21 bytes after LID)
 * or `21 AE` / `21 A2` (`bytePos = 4, 8, 12, 16, 20`, 22 bytes after LID).
 * Blank `00000000` / `FFFFFFFF` stay empty.
 */
export function sensorIdsFrom2128(data: number[] | null | undefined): (string | null)[] {
  const ids: (string | null)[] = [null, null, null, null, null];
  if (!data || data.length < 16) return ids;
  const start = data.length >= 22 ? 2 : data.length % 4 === 1 ? 1 : 0;
  for (let wheel = 0; wheel < 5; wheel++) {
    const pos = start + wheel * 4;
    if (pos + 4 > data.length) break;
    const slice = data.slice(pos, pos + 4);
    if (slice.every((byte) => byte === 0x00 || byte === 0xff)) continue;
    ids[wheel] = slice.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join("");
  }
  return ids;
}

export function changedSensorPositions(before: (string | null)[], after: (string | null)[]): number[] {
  const changed: number[] = [];
  for (let index = 0; index < after.length; index++) {
    const next = after[index];
    if (!next || next === before[index]) continue;
    changed.push(index);
  }
  return changed;
}

export function defaultRegistrationMode(modes: TpmsRoutineMode[]): TpmsRoutineMode | null {
  return (
    modes.find((mode) => mode.set === 1 && mode.wheels === 4 && mode.method === "pressure") ??
    modes.find((mode) => mode.method === "pressure" && mode.wheels === 4) ??
    modes.find((mode) => mode.method === "pressure") ??
    modes[0] ??
    null
  );
}

export function formatRegistrationClock(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function orderedDidWheels(wheels: TpmsDidWheel[]): TpmsDidWheel[] {
  return wheels.slice().sort((left, right) => {
    const leftRank = WHEEL_ORDER.indexOf(left.position as (typeof WHEEL_ORDER)[number]);
    const rightRank = WHEEL_ORDER.indexOf(right.position as (typeof WHEEL_ORDER)[number]);
    return (leftRank < 0 ? 9 : leftRank) - (rightRank < 0 ? 9 : rightRank);
  });
}

export function didWritePlan(
  recipe: TpmsDidRecipe,
  current: Record<string, string | null | undefined>,
  next: Record<string, string | null | undefined>,
): TpmsDidWrite[] {
  const writes: TpmsDidWrite[] = [];
  for (const wheel of orderedDidWheels(recipe.wheels)) {
    const raw = (next[wheel.position] ?? "").trim();
    if (!raw) continue;
    const id = assertSensorId(raw);
    const previous = compactHex(current[wheel.position] ?? "");
    if (previous === id) continue;
    const request = assertRegistrationFrame(recipe, `${wheel.writePrefix}${id}`);
    writes.push({ position: wheel.position, labelRu: wheel.labelRu, request, id });
  }
  return writes;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function modeFromUnknown(value: unknown): TpmsRoutineMode | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const startRequest = compactHex(typeof raw.startRequest === "string" ? raw.startRequest : "");
  const pollRequest = compactHex(typeof raw.pollRequest === "string" ? raw.pollRequest : "");
  if (!ROUTINE_START.test(startRequest) || !ROUTINE_POLL.test(pollRequest)) return null;
  const set = raw.set === 2 ? 2 : raw.set === 1 ? 1 : null;
  if (!set) return null;
  const method: TpmsRoutineMethod =
    raw.method === "tool" || raw.method === "pressure" ? raw.method : "custom";
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `set${set}-${startRequest.slice(4)}`;
  const nameRu = typeof raw.nameRu === "string" && raw.nameRu.trim() ? raw.nameRu.trim() : id;
  return {
    id,
    set,
    wheels: raw.wheels === 5 ? 5 : 4,
    method,
    nameRu,
    startRequest,
    pollRequest,
  };
}

function wheelFromUnknown(value: unknown): TpmsDidWheel | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const readRequest = compactHex(typeof raw.readRequest === "string" ? raw.readRequest : "");
  const writePrefix = compactHex(typeof raw.writePrefix === "string" ? raw.writePrefix : "");
  if (!DID_READ.test(readRequest) || !/^2E104[1-4]$/.test(writePrefix)) return null;
  const position = typeof raw.position === "string" ? raw.position.trim().toUpperCase() : "";
  if (!position) return null;
  const labelRu = typeof raw.labelRu === "string" && raw.labelRu.trim() ? raw.labelRu.trim() : position;
  return { position, labelRu, readRequest, writePrefix };
}

export function sanitizeTpmsRecipe(skey: string, value: unknown): TpmsRegistrationRecipe | null {
  const raw = asRecord(value);
  const id = skey.trim();
  if (!raw || !id) return null;
  if (raw.kind === "did") {
    const wheels = (Array.isArray(raw.wheels) ? raw.wheels : [])
      .map((item) => wheelFromUnknown(item))
      .filter((item): item is TpmsDidWheel => item != null);
    return wheels.length > 0 ? { kind: "did", skey: id, wheels: orderedDidWheels(wheels) } : null;
  }
  if (raw.kind !== "routine") return null;
  const modes = (Array.isArray(raw.modes) ? raw.modes : [])
    .map((item) => modeFromUnknown(item))
    .filter((item): item is TpmsRoutineMode => item != null);
  const receptionLids = (Array.isArray(raw.receptionLids) ? raw.receptionLids : [])
    .map((lid) => compactHex(typeof lid === "string" ? lid : ""))
    .filter((lid) => RECEPTION_READ.test(`21${lid}`) && lid !== "28");
  return modes.length > 0 ? { kind: "routine", skey: id, modes, receptionLids } : null;
}

export function tpmsEcusForAddress<T extends { txCanId: string; nameEn: string; nameRu: string }>(
  ecus: T[],
  txHex: string,
): T[] {
  const tx = txHex.trim().replace(/^0x/i, "").toUpperCase();
  const rank = (ecu: T) => {
    const name = `${ecu.nameEn} ${ecu.nameRu}`.toLowerCase();
    if (/tpms|oss|tyre|шин/.test(name)) return 0;
    if (/kos|wcm/.test(name)) return 1;
    if (/\bbcm\b/.test(name)) return 2;
    if (/etacs/.test(name)) return 3;
    return 4;
  };
  return ecus.filter((ecu) => ecu.txCanId.replace(/^0x/i, "").toUpperCase() === tx).sort((a, b) => rank(a) - rank(b));
}
