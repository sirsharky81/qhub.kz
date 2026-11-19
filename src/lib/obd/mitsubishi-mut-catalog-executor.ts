import type { CatalogMutStep } from "@/lib/etacs-coding/diag-catalog";
import type { Elm327Client } from "./elm327";
import { parseUdsResponse } from "./uds";
import { openMitsubishiKwpSession } from "./mitsubishi-modules";

export interface MitsubishiCatalogMutExecutionResult {
  stepId: string;
  nameRu: string;
  txHex: string;
  rxHex: string;
  success: boolean;
  requestHex: string;
  steps: string[];
  responseHex?: string | null;
}

export function buildCatalogMutRequestHex(
  step: Pick<CatalogMutStep, "udsServiceId" | "localId" | "reqMsg">,
  uploadHex?: string,
): string | null {
  const sid = step.udsServiceId;
  if (sid == null || sid < 0 || sid > 0xff) return null;
  const lid =
    step.localId != null && step.localId >= 0 ? step.localId.toString(16).padStart(2, "0") : "";
  const body = (uploadHex ?? step.reqMsg).replace(/\s+/g, "").replace(/^0x/i, "");
  const sidHex = sid.toString(16).padStart(2, "0");
  if (sid === 0x21 || sid === 0x30 || sid === 0x31 || sid === 0x32 || sid === 0x33) {
    return `${sidHex}${lid}${body}`;
  }
  if (sid === 0x3b || sid === 0x1a || sid === 0x14 || sid === 0x18) {
    return `${sidHex}${lid}${body}`;
  }
  return body.length > 0 ? `${sidHex}${body}` : sidHex;
}

export async function executeCatalogMutStep(
  elm: Elm327Client,
  options: {
    txCanId: string;
    rxCanId: string;
    step: CatalogMutStep;
    uploadHex?: string;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<MitsubishiCatalogMutExecutionResult> {
  const tx = Number.parseInt(options.txCanId, 16);
  const rx = Number.parseInt(options.rxCanId, 16);
  const requestHex = buildCatalogMutRequestHex(options.step, options.uploadHex);
  if (!requestHex) {
    throw new Error(`Не удалось собрать KWP-кадр для «${options.step.nameRu}»`);
  }
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const steps: string[] = [];
  await openMitsubishiKwpSession(elm, tx, rx, "1092");
  steps.push(`${options.txCanId}→${options.rxCanId}: сессия 10 92`);

  const sid = options.step.udsServiceId ?? 0x30;
  const raw = await elm.sendPayload(requestHex, options.step.udsServiceId === 0x3b ? 8_000 : 3_000);
  const cleanRaw = raw.replace(/>/g, "").replace(/\s+/g, " ").trim();
  steps.push(`Запрос ${requestHex.slice(0, 40)}${requestHex.length > 40 ? "…" : ""} → ${cleanRaw.slice(0, 240)}`);
  const parsed = parseUdsResponse(raw, sid);

  if (sid === 0x30 && options.step.udsServiceId === 0x30) {
    await sleep(2_500);
    try {
      const pollLid = options.step.localId ?? 0x01;
      const pollHex = `3001${pollLid.toString(16).padStart(2, "0")}`;
      const rawPoll = await elm.sendPayload(pollHex, 2_000);
      steps.push(`Статус ${pollHex} → ${rawPoll.replace(/>/g, "").replace(/\s+/g, " ").trim().slice(0, 120)}`);
    } catch {
      /* optional */
    }
  }

  const success = parsed.kind === "positive";
  if (!success && parsed.kind === "negative") {
    steps.push(`Отказ: ${parsed.nrcText ?? "NRC"}`);
  }

  try {
    await elm.sendPayload("1081", 700);
  } catch {
    /* leave session */
  }

  return {
    stepId: options.step.id,
    nameRu: options.step.nameRu,
    txHex: options.txCanId,
    rxHex: options.rxCanId,
    success,
    requestHex,
    steps,
    responseHex: cleanRaw || null,
  };
}