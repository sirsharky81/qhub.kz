import { parseHexBytes, parseUdsResponse } from "./uds";

export interface SubaruMeterWriteLink {
  sendCommand(command: string, timeoutMs?: number): Promise<string>;
  setCanHeader(tx: number, rx?: number): Promise<void>;
  sendPayload(hexPayload: string, timeoutMs?: number): Promise<string>;
}
import {
  asciiFromSubaruDidHex,
  decodeSubaruAppliedModel12Columns,
  parseSubaru12ColumnFromAscii,
} from "./subaru-ssm4-catalog";

/** Procedure B write targets only — never odometer / common-area DIDs. */
export const SUBARU_METER_WRITE_DIDS = ["0250", "0251"] as const;

/** US/Canada TPMS 315 MHz. EC/EA (433 MHz) are rejected. */
export const SUBARU_METER_WRITE_ALLOWED_DESTINATIONS = ["U4", "U5", "U6", "C0", "C5"] as const;

const APPLIED_MODEL_RE =
  /^(BT[9A]|BW[9A]|SK[79]|GT[7A]|GU[7A]|GK[7A]|WMA)[A-Z][YLK5][A-Z0-9]{2}$/;

const METER_TARGETS: { tx: number; rx: number }[] = [
  { tx: 0x783, rx: 0x78b },
  { tx: 0x7c0, rx: 0x7c8 },
];

export type SubaruMeterWriteDestination =
  (typeof SUBARU_METER_WRITE_ALLOWED_DESTINATIONS)[number];

export interface SubaruMeterDidSnapshot {
  did: string;
  hex: string;
}

export interface SubaruMeterWriteCandidate {
  did: (typeof SUBARU_METER_WRITE_DIDS)[number];
  dataHex: string;
  requestHex: string;
  noteRu: string;
}

export interface SubaruMeter12ColumnWritePlan {
  ok: boolean;
  appliedModel: string;
  optionCode: string;
  packedAscii: string;
  destinationPrefix: string;
  destinationRu: string;
  reasonRu: string;
  candidates: SubaruMeterWriteCandidate[];
}

export interface SubaruMeter12ColumnWriteResult {
  success: boolean;
  steps: string[];
  plan: SubaruMeter12ColumnWritePlan;
  writtenDid: string | null;
  writtenHex: string | null;
  securityAccessRequired: boolean;
}

export function isSubaruMeterWriteDestination(
  prefix: string,
): prefix is SubaruMeterWriteDestination {
  return (SUBARU_METER_WRITE_ALLOWED_DESTINATIONS as readonly string[]).includes(prefix);
}

export function normalizeSubaruMeter12ColumnWriteInput(
  appliedModelInput: string,
  optionCodeInput: string,
): { ok: true; appliedModel: string; optionCode: string } | { ok: false; reasonRu: string } {
  const appliedModel = appliedModelInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const optionCode = optionCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (appliedModel.length !== 7 || optionCode.length !== 4) {
    return { ok: false, reasonRu: "Нужны ровно 7 символов Applied Model и 4 символа Option Code." };
  }
  if (!APPLIED_MODEL_RE.test(appliedModel)) {
    return {
      ok: false,
      reasonRu: `Applied Model «${appliedModel}» не похож на Subaru 12-column (BTA/BT9/SK/GT/WM…).`,
    };
  }
  const dest = optionCode.slice(0, 2);
  if (dest === "EC" || dest === "EA") {
    return {
      ok: false,
      reasonRu:
        "Коды EC/EA (Европа / СНГ, TPMS 433 МГц) запрещены. Для США/Канады только U4, U5, U6, C0, C5 (TPMS 315 МГц).",
    };
  }
  if (!isSubaruMeterWriteDestination(dest)) {
    return {
      ok: false,
      reasonRu: `Регион «${dest}» не из списка записи US/Canada (U4/U5/U6/C0/C5).`,
    };
  }
  return { ok: true, appliedModel, optionCode };
}

function asciiBytes(text: string): number[] {
  return [...text].map((ch) => ch.charCodeAt(0));
}

function spacedHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function compactHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function didBytes(hex: string): number[] {
  return parseHexBytes(hex) ?? [];
}

function xor8(bytes: number[]): number {
  return bytes.reduce((acc, b) => acc ^ b, 0) & 0xff;
}

function sum8(bytes: number[]): number {
  return bytes.reduce((acc, b) => acc + b, 0) & 0xff;
}

function trailerFor(oldBody: number[], newBody: number[], oldTrailer: number): number {
  if (oldTrailer === 0x00 || oldTrailer === 0x20) return oldTrailer;
  if (oldTrailer === xor8(oldBody)) return xor8(newBody);
  if (oldTrailer === sum8(oldBody)) return sum8(newBody);
  const oldTwos = (0x100 - sum8(oldBody)) & 0xff;
  if (oldTrailer === oldTwos) return (0x100 - sum8(newBody)) & 0xff;
  return oldTrailer;
}

function isPrintableAscii(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

function splicePackedAscii(current: number[], packed: string): number[] | null {
  const packedBytes = asciiBytes(packed);
  if (packedBytes.length !== 11) return null;

  for (let i = 0; i + 11 <= current.length; i++) {
    const slice = current.slice(i, i + 11);
    if (!slice.every(isPrintableAscii)) continue;
    const parsed = parseSubaru12ColumnFromAscii(String.fromCharCode(...slice));
    if (!parsed.appliedModel || !parsed.optionCode) continue;
    const next = current.slice();
    for (let j = 0; j < packedBytes.length; j++) next[i + j] = packedBytes[j]!;
    if (i + 12 <= next.length) {
      const oldBody = current.slice(i, i + 11);
      next[i + 11] = trailerFor(oldBody, packedBytes, current[i + 11]!);
    }
    return next;
  }

  if (current.length === 11) return packedBytes;
  if (current.length === 12) {
    return [...packedBytes, trailerFor(current.slice(0, 11), packedBytes, current[11]!)];
  }
  return null;
}

function splicePackedUtf16Le(current: number[], packed: string): number[] | null {
  if (packed.length !== 11) return null;
  for (let i = 0; i + 22 <= current.length; i++) {
    let text = "";
    let ok = true;
    for (let c = 0; c < 11; c++) {
      const lo = current[i + c * 2]!;
      const hi = current[i + c * 2 + 1]!;
      if (hi !== 0 || !isPrintableAscii(lo)) {
        ok = false;
        break;
      }
      text += String.fromCharCode(lo);
    }
    if (!ok) continue;
    const parsed = parseSubaru12ColumnFromAscii(text);
    if (!parsed.appliedModel || !parsed.optionCode) continue;
    const next = current.slice();
    for (let c = 0; c < packed.length; c++) {
      next[i + c * 2] = packed.charCodeAt(c);
      next[i + c * 2 + 1] = 0x00;
    }
    return next;
  }
  return null;
}

function candidate(
  did: (typeof SUBARU_METER_WRITE_DIDS)[number],
  data: number[],
  noteRu: string,
): SubaruMeterWriteCandidate {
  const dataHex = spacedHex(data);
  return {
    did,
    dataHex,
    requestHex: `2E${did}${compactHex(data)}`,
    noteRu,
  };
}

function assertWriteCandidate(item: SubaruMeterWriteCandidate): void {
  if (item.did !== "0250" && item.did !== "0251") {
    throw new Error("Запись разрешена только в DID 0250/0251.");
  }
  if (!item.requestHex.startsWith(`2E${item.did}`)) {
    throw new Error("Кандидат записи должен быть UDS 2E на DID 0250 или 0251.");
  }
  if (item.requestHex.length < 10) {
    throw new Error("Пустой payload записи приборки.");
  }
}

/**
 * Builds UDS 2E payloads for Combination Meter Procedure B (sendMetVariByApplied).
 * Prefers splicing Applied+Option into the live DID layout so length/padding/checksum stay.
 */
export function buildSubaruMeter12ColumnWritePlan(
  appliedModelInput: string,
  optionCodeInput: string,
  currentDids: SubaruMeterDidSnapshot[] = [],
): SubaruMeter12ColumnWritePlan {
  const normalized = normalizeSubaruMeter12ColumnWriteInput(appliedModelInput, optionCodeInput);
  if (!normalized.ok) {
    return {
      ok: false,
      appliedModel: appliedModelInput.trim().toUpperCase(),
      optionCode: optionCodeInput.trim().toUpperCase(),
      packedAscii: "",
      destinationPrefix: "",
      destinationRu: "",
      reasonRu: normalized.reasonRu,
      candidates: [],
    };
  }

  const { appliedModel, optionCode } = normalized;
  const packedAscii = `${appliedModel}${optionCode}`;
  const decoded = decodeSubaruAppliedModel12Columns(appliedModel, optionCode);
  const packedBytes = asciiBytes(packedAscii);
  const candidates: SubaruMeterWriteCandidate[] = [];
  const seen = new Set<string>();

  const push = (item: SubaruMeterWriteCandidate) => {
    assertWriteCandidate(item);
    if (seen.has(item.requestHex)) return;
    seen.add(item.requestHex);
    candidates.push(item);
  };

  for (const did of SUBARU_METER_WRITE_DIDS) {
    const snap = currentDids.find((d) => d.did === did);
    if (!snap) continue;
    const current = didBytes(snap.hex);
    if (current.length === 0) continue;

    const spliced =
      splicePackedAscii(current, packedAscii) ?? splicePackedUtf16Le(current, packedAscii);
    if (spliced) {
      push(
        candidate(
          did,
          spliced,
          `Срастить ${packedAscii} в текущий DID ${did} (${current.length} байт, длина сохранена)`,
        ),
      );
      continue;
    }

    if (current.length === 11 || current.length === 12) {
      const data =
        current.length === 12
          ? [...packedBytes, trailerFor(current.slice(0, 11), packedBytes, current[11]!)]
          : packedBytes;
      push(
        candidate(
          did,
          data,
          `Заменить DID ${did} целиком (${current.length} байт) на ASCII ${packedAscii}`,
        ),
      );
    }
  }

  if (candidates.length === 0) {
    const hasDidBytes = currentDids.some(
      (d) => (d.did === "0250" || d.did === "0251") && didBytes(d.hex).length > 0,
    );
    if (hasDidBytes) {
      const preview = currentDids
        .filter((d) => d.did === "0250" || d.did === "0251")
        .map((d) => `${d.did}=${d.hex} (${asciiFromSubaruDidHex(d.hex)})`)
        .join("; ");
      return {
        ok: false,
        appliedModel,
        optionCode,
        packedAscii,
        destinationPrefix: decoded.optionDestinationPrefix,
        destinationRu: decoded.optionDestinationRu,
        reasonRu:
          `DID 0250/0251 не содержат ASCII Applied+Option (похоже на битовую маску). Запись угадана не будет: ${preview || "пусто"}.`,
        candidates: [],
      };
    }
    push(candidate("0250", packedBytes, `11 байт ASCII ${packedAscii} в DID 0250`));
    push(
      candidate("0250", [...packedBytes, 0x00], `12 байт ASCII ${packedAscii}+00 в DID 0250`),
    );
    push(candidate("0251", packedBytes, `11 байт ASCII ${packedAscii} в DID 0251 (если 0250 не примет)`));
  }

  return {
    ok: candidates.length > 0,
    appliedModel,
    optionCode,
    packedAscii,
    destinationPrefix: decoded.optionDestinationPrefix,
    destinationRu: decoded.optionDestinationRu,
    reasonRu:
      candidates.length > 0
        ? `Procedure B: UDS 2E только DID 0250/0251, код ${appliedModel} + ${optionCode}. writeCommonArea не используется.`
        : "Нет безопасного payload для записи.",
    candidates,
  };
}

async function openMeterSession(elm: SubaruMeterWriteLink, tx: number, rx: number): Promise<void> {
  try {
    await elm.sendCommand("ATS1");
    await elm.sendCommand("ATH0");
    await elm.sendCommand("ATAL");
  } catch {
    /* ignore */
  }
  await elm.setCanHeader(tx, rx);
  const txHex = tx.toString(16).padStart(3, "0").toUpperCase();
  try {
    await elm.sendCommand(`ATFCSH${txHex}`);
    await elm.sendCommand("ATFCSD30080A");
    await elm.sendCommand("ATFCSM1");
  } catch {
    /* simple adapters */
  }
  await elm.sendPayload("1003", 2_000);
}

async function closeMeterSession(elm: SubaruMeterWriteLink): Promise<void> {
  try {
    await elm.sendPayload("1001", 1_000);
  } catch {
    /* ignore */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWriteWithRetry(
  elm: SubaruMeterWriteLink,
  requestHex: string,
  steps: string[],
  label: string,
): Promise<ReturnType<typeof parseUdsResponse>> {
  let last = parseUdsResponse("", 0x2e);
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await elm.sendPayload("3E00", 800);
    } catch {
      /* ignore */
    }
    const raw = await elm.sendPayload(requestHex, 8_000);
    const parsed = parseUdsResponse(raw, 0x2e);
    const clean = raw.replace(/>/g, "").trim();
    steps.push(
      `${label}: попытка ${attempt} → ${clean || "нет ответа"}` +
        (parsed.kind === "negative" ? ` (${parsed.nrcText ?? "NRC"})` : ""),
    );
    last = parsed;
    if (parsed.kind === "positive") return parsed;
    if (parsed.kind === "negative" && parsed.nrc === 0x33) return parsed;
    if (
      parsed.kind === "negative" &&
      (parsed.nrc === 0x21 || parsed.nrc === 0x78 || parsed.nrc === 0x22) &&
      attempt < 6
    ) {
      await sleep(parsed.nrc === 0x78 ? 500 : 350);
      continue;
    }
    return parsed;
  }
  return last;
}

/**
 * Writes Applied Model + Option Code to Combination Meter via UDS 2E DID 0250/0251.
 * Never calls writeCommonArea, never writes odometer DIDs, never invents SecurityAccess keys.
 */
export async function writeSubaruMeter12ColumnCode(
  elm: SubaruMeterWriteLink,
  input: {
    appliedModel: string;
    optionCode: string;
    currentDids?: SubaruMeterDidSnapshot[];
    txHex?: string;
    rxHex?: string;
  },
): Promise<SubaruMeter12ColumnWriteResult> {
  const plan = buildSubaruMeter12ColumnWritePlan(
    input.appliedModel,
    input.optionCode,
    input.currentDids ?? [],
  );
  const steps: string[] = [plan.reasonRu];
  if (!plan.ok || plan.candidates.length === 0) {
    return {
      success: false,
      steps,
      plan,
      writtenDid: null,
      writtenHex: null,
      securityAccessRequired: false,
    };
  }

  const preferredTx = input.txHex ? Number.parseInt(input.txHex, 16) : NaN;
  const preferredRx = input.rxHex ? Number.parseInt(input.rxHex, 16) : NaN;
  const targets =
    Number.isFinite(preferredTx) && Number.isFinite(preferredRx)
      ? [
          { tx: preferredTx, rx: preferredRx },
          ...METER_TARGETS.filter((t) => t.tx !== preferredTx),
        ]
      : METER_TARGETS;

  try {
    await elm.sendCommand("ATSTFF");
  } catch {
    /* ignore */
  }

  try {
    await openMeterSession(elm, 0x750, 0x758);
    steps.push("750→758 (CGW): расширенная сессия шлюза (10 03)");
  } catch {
    steps.push("750→758 (CGW): 10 03 не обязателен / нет ответа");
  }

  let securityAccessRequired = false;
  let writtenDid: string | null = null;
  let writtenHex: string | null = null;

  for (const target of targets) {
    const txHex = target.tx.toString(16).toUpperCase();
    const rxHex = target.rx.toString(16).toUpperCase();
    try {
      await openMeterSession(elm, target.tx, target.rx);
      steps.push(`${txHex}→${rxHex}: открыта сессия приборки (10 03)`);
    } catch (error) {
      steps.push(
        `${txHex}→${rxHex}: не удалось открыть 10 03 (${error instanceof Error ? error.message : String(error)})`,
      );
      continue;
    }

    try {
      for (const item of plan.candidates) {
        assertWriteCandidate(item);
        const parsed = await sendWriteWithRetry(
          elm,
          item.requestHex,
          steps,
          `${txHex}→${rxHex} 2E ${item.did} (${item.noteRu})`,
        );
        if (parsed.kind === "positive") {
          writtenDid = item.did;
          writtenHex = item.dataHex;
          steps.push(`${txHex}→${rxHex}: DID ${item.did} записан (6E)`);
          break;
        }
        if (parsed.kind === "negative" && parsed.nrc === 0x33) {
          securityAccessRequired = true;
          steps.push(
            `${txHex}→${rxHex}: NRC 33 SecurityAccess. Ключ приборки в QHub не подставляется — нужна дилерская SSM4.`,
          );
          break;
        }
      }
    } finally {
      await closeMeterSession(elm);
      steps.push(`${txHex}→${rxHex}: сессия закрыта (10 01)`);
    }

    if (writtenDid || securityAccessRequired) break;
  }

  if (!writtenDid && !securityAccessRequired) {
    steps.push(
      "Приборка не подтвердила 2E 0250/0251. Проверьте IG ON, адрес 783 и что DID — ASCII, а не битовая маска.",
    );
  }

  return {
    success: writtenDid != null,
    steps,
    plan,
    writtenDid,
    writtenHex,
    securityAccessRequired,
  };
}
