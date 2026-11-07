import type { Elm327Client } from "./elm327";
import {
  closeMitsubishiKwpSession,
  extractKwp21Data,
  openMitsubishiKwpSession,
} from "./mitsubishi-modules";
import {
  assertRegistrationFrame,
  assertRegistrationTx,
  assertSensorId,
  changedSensorPositions,
  didWritePlan,
  orderedDidWheels,
  sanitizeTpmsRecipe,
  sensorIdsFrom2128,
  tpmsReceptionState,
  TPMS_REGISTRATION_WINDOW_MS,
  type TpmsDidRecipe,
  type TpmsReceptionFlag,
  type TpmsRoutineMode,
  type TpmsRoutineProgress,
  type TpmsRoutineRecipe,
  type TpmsRoutineResult,
} from "./mitsubishi-tpms-registration";
import { parseUdsResponse } from "./uds";

export interface TpmsRegistrationLink {
  sendCommand(command: string): Promise<string>;
  setCanHeader(txId: number, rxId?: number): Promise<void>;
  sendPayload(hexPayload: string, timeoutMs?: number): Promise<string>;
}

export interface TpmsRoutineOptions {
  tx: number;
  rx: number;
  recipe: TpmsRoutineRecipe;
  modeId: string;
  windowMs?: number;
  pollMs?: number;
  shouldStop?: () => boolean;
  onProgress?: (progress: TpmsRoutineProgress) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface TpmsDidWriteResult {
  reads: Record<string, string | null>;
  written: Array<{ position: string; labelRu: string; id: string; readBack: string | null }>;
  noteRu: string;
}

function noteFor(status: TpmsRoutineResult["status"]): string {
  if (status === "accepted") return "Блок принял ID. Сверьте колёса и поднимите давление.";
  if (status === "stopped") {
    return "Опрос остановлен. Команда отмены не отправлялась. Если рутина ещё активна, выключите зажигание.";
  }
  return "20 минут вышли. Если не все ID приняты, ранее прописанные ID могли стереться. Начните прописку заново.";
}

async function pause(ms: number, shouldStop: () => boolean, sleep: (ms: number) => Promise<void>): Promise<boolean> {
  let left = ms;
  while (left > 0) {
    if (shouldStop()) return false;
    const slice = Math.min(200, left);
    await sleep(slice);
    left -= slice;
  }
  return !shouldStop();
}

function requirePositive(raw: string, sid: number, label: string): void {
  const parsed = parseUdsResponse(raw, sid);
  if (parsed.kind === "positive") return;
  const reason = parsed.kind === "negative" ? (parsed.nrcText ?? "отказ блока") : "нет ответа";
  throw new Error(`${label}: ${reason}`);
}

function cleanRoutine(recipe: TpmsRoutineRecipe): TpmsRoutineRecipe {
  const clean = sanitizeTpmsRecipe(recipe.skey, recipe);
  if (!clean || clean.kind !== "routine") throw new Error("Рецепт прописки не принят");
  return clean;
}

function cleanDid(recipe: TpmsDidRecipe): TpmsDidRecipe {
  const clean = sanitizeTpmsRecipe(recipe.skey, recipe);
  if (!clean || clean.kind !== "did") throw new Error("Рецепт записи ID не принят");
  return clean;
}

export async function runMitsubishiTpmsRoutine(
  elm: TpmsRegistrationLink,
  options: TpmsRoutineOptions,
): Promise<TpmsRoutineResult> {
  assertRegistrationTx(options.tx);
  if (!Number.isInteger(options.rx) || options.rx <= 0 || options.rx > 0x7ff) {
    throw new Error("Неверный адрес ответа блока TPMS");
  }
  const recipe = cleanRoutine(options.recipe);
  const mode = recipe.modes.find((item) => item.id === options.modeId);
  if (!mode) throw new Error("Этот режим прописки в рецепте блока не найден");
  const startRequest = assertRegistrationFrame(recipe, mode.startRequest);
  assertRegistrationFrame(recipe, mode.pollRequest);
  const windowMs = Math.min(options.windowMs ?? TPMS_REGISTRATION_WINDOW_MS, TPMS_REGISTRATION_WINDOW_MS);
  const pollMs = Math.max(200, options.pollMs ?? 1000);
  const shouldStop = options.shouldStop ?? (() => false);
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  await openMitsubishiKwpSession(elm as Elm327Client, options.tx, options.rx, "1092");
  try {
    requirePositive(await elm.sendPayload(startRequest, 2_000), 0x31, "Старт прописки");
    const started = now();
    let baseline: (string | null)[] | null = null;
    let latest = emptyProgress(windowMs);
    while (true) {
      if (shouldStop()) return finish("stopped", latest);
      latest = await pollOnce(elm, recipe, mode);
      if (!baseline) baseline = latest.ids.slice();
      const elapsed = now() - started;
      latest = { ...latest, elapsedMs: elapsed, remainingMs: Math.max(0, windowMs - elapsed) };
      options.onProgress?.(latest);
      if (accepted(recipe, mode, latest, baseline)) return finish("accepted", latest);
      if (elapsed >= windowMs) return finish("timeout", latest);
      const keepGoing = await pause(pollMs, shouldStop, sleep);
      if (!keepGoing) return finish("stopped", latest);
    }
  } finally {
    await closeMitsubishiKwpSession(elm as Elm327Client);
  }
}

function emptyProgress(windowMs: number): TpmsRoutineProgress {
  return { elapsedMs: 0, remainingMs: windowMs, reception: [], ids: [null, null, null, null, null] };
}

async function pollOnce(
  elm: TpmsRegistrationLink,
  recipe: TpmsRoutineRecipe,
  mode: TpmsRoutineMode,
): Promise<TpmsRoutineProgress> {
  const reception: TpmsReceptionFlag[] = [];
  for (const lid of recipe.receptionLids) {
    const request = assertRegistrationFrame(recipe, `21${lid}`);
    try {
      const raw = await elm.sendPayload(request, 1_500);
      const data = extractKwp21Data(raw, Number.parseInt(lid, 16));
      reception.push({ lid, state: data ? tpmsReceptionState(data) : "unknown" });
    } catch {
      reception.push({ lid, state: "unknown" });
    }
  }
  let ids: (string | null)[] = [null, null, null, null, null];
  for (const idFrame of ["2128", "21A6"] as const) {
    try {
      const request = assertRegistrationFrame(recipe, idFrame);
      const raw = await elm.sendPayload(request, 1_800);
      ids = sensorIdsFrom2128(extractKwp21Data(raw, Number.parseInt(idFrame.slice(2), 16)));
      if (ids.some((id) => id != null)) break;
    } catch {
      /* the next poll reads the IDs again */
    }
  }
  // The routine poll is part of the MUT procedure. A missing poll answer does not cancel the wait.
  try {
    const request = assertRegistrationFrame(recipe, mode.pollRequest);
    await elm.sendPayload(request, 1_500);
  } catch {
    /* keep waiting inside the 20 minute window */
  }
  return { elapsedMs: 0, remainingMs: 0, reception, ids };
}

function accepted(
  recipe: TpmsRoutineRecipe,
  mode: TpmsRoutineMode,
  progress: TpmsRoutineProgress,
  baseline: (string | null)[] | null,
): boolean {
  if (recipe.receptionLids.length > 0) {
    const watched = progress.reception.slice(0, mode.wheels);
    return watched.length >= mode.wheels && watched.every((item) => item.state === "received");
  }
  if (!baseline) return false;
  return changedSensorPositions(baseline, progress.ids).length >= mode.wheels;
}

function finish(status: TpmsRoutineResult["status"], progress: TpmsRoutineProgress): TpmsRoutineResult {
  return { ...progress, status, noteRu: noteFor(status) };
}

function idFromDidPayload(payload: number[]): string | null {
  if (payload.length < 6) return null;
  const hex = payload
    .slice(2, 6)
    .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
    .join("");
  if (hex === "00000000" || hex === "FFFFFFFF") return null;
  return hex;
}

export async function readMitsubishiTpmsDidIds(
  elm: TpmsRegistrationLink,
  tx: number,
  rx: number,
  recipe: TpmsDidRecipe,
): Promise<Record<string, string | null>> {
  assertRegistrationTx(tx);
  const clean = cleanDid(recipe);
  const reads: Record<string, string | null> = {};
  await openMitsubishiKwpSession(elm as Elm327Client, tx, rx, "1003");
  try {
    for (const wheel of orderedDidWheels(clean.wheels)) {
      const request = assertRegistrationFrame(clean, wheel.readRequest);
      try {
        const raw = await elm.sendPayload(request, 1_500);
        const parsed = parseUdsResponse(raw, 0x22);
        reads[wheel.position] = parsed.kind === "positive" ? idFromDidPayload(parsed.payload) : null;
      } catch {
        reads[wheel.position] = null;
      }
    }
    return reads;
  } finally {
    try {
      await elm.sendPayload("1001", 800);
    } catch {
      /* default session */
    }
    await closeMitsubishiKwpSession(elm as Elm327Client);
  }
}

export async function writeMitsubishiTpmsIds(
  elm: TpmsRegistrationLink,
  tx: number,
  rx: number,
  recipe: TpmsDidRecipe,
  next: Record<string, string | null | undefined>,
): Promise<TpmsDidWriteResult> {
  assertRegistrationTx(tx);
  const clean = cleanDid(recipe);
  for (const wheel of clean.wheels) {
    const raw = (next[wheel.position] ?? "").trim();
    if (raw) assertSensorId(raw);
  }
  await openMitsubishiKwpSession(elm as Elm327Client, tx, rx, "1003");
  try {
    const current: Record<string, string | null> = {};
    for (const wheel of orderedDidWheels(clean.wheels)) {
      const request = assertRegistrationFrame(clean, wheel.readRequest);
      const raw = await elm.sendPayload(request, 1_500);
      const parsed = parseUdsResponse(raw, 0x22);
      if (parsed.kind !== "positive") {
        throw new Error(`${wheel.labelRu}: не удалось прочитать текущий ID`);
      }
      current[wheel.position] = idFromDidPayload(parsed.payload);
    }
    const plan = didWritePlan(clean, current, next);
    const written: TpmsDidWriteResult["written"] = [];
    for (const item of plan) {
      const request = assertRegistrationFrame(clean, item.request);
      requirePositive(await elm.sendPayload(request, 2_000), 0x2e, item.labelRu);
      const wheel = clean.wheels.find((entry) => entry.position === item.position)!;
      const read = assertRegistrationFrame(clean, wheel.readRequest);
      const raw = await elm.sendPayload(read, 1_500);
      const parsed = parseUdsResponse(raw, 0x22);
      written.push({
        position: item.position,
        labelRu: item.labelRu,
        id: item.id,
        readBack: parsed.kind === "positive" ? idFromDidPayload(parsed.payload) : null,
      });
    }
    return {
      reads: current,
      written,
      noteRu: written.length > 0 ? "Записаны только изменённые колёса. Сверьте ID, которые блок прочитал обратно." : "Изменённых ID нет, запись не отправлялась.",
    };
  } finally {
    try {
      await elm.sendPayload("1001", 800);
    } catch {
      /* default session */
    }
    await closeMitsubishiKwpSession(elm as Elm327Client);
  }
}
