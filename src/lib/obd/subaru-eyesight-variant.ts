import {
  SSM4_YYW_FP_DID_KEYS,
  getSsm4YywWriteDids,
  lookupSsm4YywFingerprint,
} from "./subaru-ssm4-yyw-fingerprints";
import {
  isWritableEyesightVariantDid,
  type SubaruEyesightWriteEntry,
} from "./subaru-eyesight-backup";
import {
  unlockSubaruCgwFilterRemove,
  unlockSubaruMeterSecurityAccess,
  type SubaruMeterWriteLink,
} from "./subaru-meter-variant";
import { parseUdsResponse } from "./uds";

/**
 * SSM4 EyeSight Work Support:
 * - Selection of Parameter (`ADA-031.srp`, FuncId 40730):
 *   `10 03` → `SecurityAccessExecute(3, 2)` → `22 35 01..10` → `changeVariantExtend` (Y-Yw)
 *   → `2E 35 01..0A` + `ReadWriteDidListData(1, 35 0B..10)` → verify `22 35 01..10` (B08/B09) → `10 01`.
 * - Confirm on Parameter (`ADA-032.srp`, FuncId 40731):
 *   `10 03` → `SecurityAccessExecute(3, 2)` → `22 35 01..10` → `setVehicleListExtend` (Y-Yw) → `10 01` (read-only).
 */
export const SUBARU_EYESIGHT_VARIANT_SAFE_PATH = {
  ssm4MenuEn: "Selection of Parameter",
  ssm4Script: "ADA-031.srp",
  ssm4ConfirmScript: "ADA-032.srp",
  txRx: "787→78F",
  writeDidRange: "3501..3510",
  envLib: "Y-YwPHBWHoZ.mLW",
  needsCgwFilterRemove: true,
} as const;

/** Primary SSM4 ADA-031 inline frames (`3501..350A`); `350B..3510` follow via `ReadWriteDidListData`. */
export const SUBARU_EYESIGHT_ADA031_WRITE_DIDS = [
  "3501",
  "3502",
  "3503",
  "3504",
  "3505",
  "3506",
  "3507",
  "3508",
  "3509",
  "350A",
] as const;

/**
 * `ADA-031.srp` / `ADA-032.srp` invoke `SecurityAccessExecute("3", "2")`:
 * Level `3` (`27 03`/`27 04`), `ecuKind = 0x0002` (`CTRL_0002_0251_1 / _16 / _32` matching `22 02 51`).
 * `0x02` MUST precede `0x03` (`12555_0251_1`), because EyeSight (`787`) locks out with `NRC 36` on the first wrong key.
 */
const EYESIGHT_PREFERRED_ECU_KINDS = [0x02, 0x05, 0x0f, 0x03, 0x01, 0x0d, 0x0e, 0x0c] as const;

export type SubaruEyesightWriteMode = "full-yyw" | "region-only" | "custom-35xx";

export interface SubaruEyesightVariantWriteResult {
  success: boolean;
  writeMode: SubaruEyesightWriteMode;
  steps: string[];
  appliedModel: string;
  optionCode: string;
  writtenCount: number;
  targetCount: number;
  verifiedCount: number;
  mismatchedDids: string[];
  afterDidMap: Record<string, string>;
  securityAccessRequired: boolean;
  cgwFilterRemoved: boolean;
}

async function openEyesightSession(
  elm: SubaruMeterWriteLink,
  tx: number,
  rx: number,
  options?: { clearRxFilter?: boolean },
): Promise<{ ok: boolean; raw: string }> {
  try {
    await elm.sendCommand("ATS1");
    await elm.sendCommand("ATH0");
    await elm.sendCommand("ATAL");
  } catch {
    /* ignore */
  }
  if (options?.clearRxFilter) {
    try {
      await elm.clearRxFilter?.();
    } catch {
      /* ignore */
    }
    try {
      await elm.sendCommand("ATAR");
    } catch {
      /* ignore */
    }
  }
  await elm.setCanHeader(tx, options?.clearRxFilter ? undefined : rx);
  const txHex = tx.toString(16).padStart(3, "0").toUpperCase();
  try {
    await elm.sendCommand(`ATFCSH${txHex}`);
    await elm.sendCommand("ATFCSD30080A");
    await elm.sendCommand("ATFCSM1");
  } catch {
    /* ignore */
  }
  const raw = await elm.sendPayload("1003", 2_000);
  const p = parseUdsResponse(raw, 0x10);
  return { ok: p.kind === "positive", raw: raw.replace(/>/g, "").trim() };
}

/** Candidate SGP ADAS / EyeSight CAN TX/RX pairs used for fallback discovery when 787/784 are silent. */
const EYESIGHT_DISCOVERY_CANDIDATES: readonly { tx: number; rx: number; label: string }[] = [
  { tx: 0x785, rx: 0x78d, label: "785→78D (ADAS alt)" },
  { tx: 0x7b7, rx: 0x7bf, label: "7B7→7BF (ADAS Gen4)" },
  { tx: 0x767, rx: 0x76f, label: "767→76F (ADAS alt)" },
  { tx: 0x757, rx: 0x75f, label: "757→75F (ADAS alt)" },
  { tx: 0x747, rx: 0x74f, label: "747→74F (ADAS alt)" },
  { tx: 0x7a7, rx: 0x7af, label: "7A7→7AF (ADAS alt)" },
  { tx: 0x781, rx: 0x789, label: "781→789 (ADAS alt)" },
  { tx: 0x782, rx: 0x78a, label: "782→78A (ADAS alt)" },
  { tx: 0x7e4, rx: 0x7ec, label: "7E4→7EC (ADAS alt)" },
  { tx: 0x7e5, rx: 0x7ed, label: "7E5→7ED (ADAS alt)" },
];

async function probeEyesightWithOpenRx(
  elm: SubaruMeterWriteLink,
  tx: number,
  steps: string[],
): Promise<{ rx: number; raw: string } | null> {
  const txHex = tx.toString(16).padStart(3, "0").toUpperCase();
  try {
    await elm.sendCommand("ATH1");
    await elm.sendCommand("ATS1");
    await elm.clearRxFilter?.();
    await elm.sendCommand("ATAR");
    await elm.setCanHeader(tx, undefined);
    const raw10 = await elm.sendPayload("1003", 1_500);
    const clean = raw10.replace(/>/g, "").replace(/\s+/g, " ").trim();
    const lines = clean.split(/\r|\n/).filter(Boolean);
    for (const line of lines) {
      const m = line.toUpperCase().match(/\b([0-9A-F]{3})\s+[0-9A-F]{2}\s+(50|7F)\b/);
      if (m?.[1]) {
        const rx = Number.parseInt(m[1], 16);
        steps.push(`${txHex} (без RX-фильтра): ответил CAN ID ${m[1]} (${line})`);
        return { rx, raw: line };
      }
    }
    steps.push(`${txHex} (без RX-фильтра): ${clean || "NO DATA"}`);
  } catch (e) {
    steps.push(`${txHex} (без RX-фильтра): ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    try {
      await elm.sendCommand("ATH0");
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function readEyesightKeyVersionByte(elm: SubaruMeterWriteLink): Promise<number | null> {
  try {
    const raw = await elm.sendPayload("220251", 1_200);
    const p = parseUdsResponse(raw, 0x22);
    if (p.kind === "positive" && p.payload.length >= 3) {
      return p.payload[2] ?? p.payload[p.payload.length - 1] ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function readEyesightAlgoByte(elm: SubaruMeterWriteLink): Promise<number | null> {
  try {
    const raw = await elm.sendPayload("220250", 1_200);
    const p = parseUdsResponse(raw, 0x22);
    if (p.kind === "positive" && p.payload.length >= 3) {
      return p.payload[2] ?? p.payload[p.payload.length - 1] ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function probeEyesightMultiFrame(
  elm: SubaruMeterWriteLink,
  txHex: string,
  rxHex: string,
  steps: string[],
): Promise<void> {
  const probes: { payload: string; sid: number; label: string }[] = [
    { payload: "22F182", sid: 0x22, label: "22 F1 82" },
    { payload: "22F187", sid: 0x22, label: "22 F1 87" },
    { payload: "22F197", sid: 0x22, label: "22 F1 97" },
    { payload: "22F181", sid: 0x22, label: "22 F1 81" },
    { payload: "22F18E", sid: 0x22, label: "22 F1 8E" },
    { payload: "1902FF", sid: 0x19, label: "19 02 FF" },
  ];
  const notes: string[] = [];
  for (const probe of probes) {
    try {
      const raw = await elm.sendPayload(probe.payload, 1_500);
      const parsed = parseUdsResponse(raw, probe.sid);
      const clean = raw.replace(/>/g, "").replace(/\s+/g, " ").trim() || "NO DATA";
      if (parsed.kind === "positive") {
        steps.push(
          `${txHex}→${rxHex}: проверка multi-frame ${probe.label} → OK (${parsed.payload.length} байт: ${clean})`,
        );
        return;
      }
      notes.push(`${probe.label}→${clean}`);
    } catch {
      /* ignore */
    }
  }
  if (notes.length > 0) {
    steps.push(`${txHex}→${rxHex}: проверка multi-frame (${notes.join(", ")})`);
  }
}

async function probeEyesightRawCan2703(
  elm: SubaruMeterWriteLink,
  tx: number,
  rx: number,
  steps: string[],
  contextLabel: string,
): Promise<void> {
  const txHex = tx.toString(16).toUpperCase();
  try {
    await elm.sendCommand("ATCAF0");
    await elm.sendCommand("ATH1");
    await elm.sendCommand("ATS1");
    await elm.clearRxFilter?.();
    await elm.sendCommand("ATAR");
    await elm.setCanHeader(tx, undefined);
    const rawZeroPad = await elm.sendPayload("0227030000000000", 1_500);
    const cleanZero = rawZeroPad.replace(/>/g, "").replace(/\s+/g, " ").trim();
    steps.push(
      `${txHex} (raw ATCAF0+ATH1 02 27 03 00..${contextLabel ? ` · ${contextLabel}` : ""}): ${cleanZero || "NO DATA"}`,
    );
    if (!cleanZero || /^NO DATA$/i.test(cleanZero)) {
      const rawAaPad = await elm.sendPayload("022703AAAAAAAAAA", 1_200);
      const cleanAa = rawAaPad.replace(/>/g, "").replace(/\s+/g, " ").trim();
      if (cleanAa && !/^NO DATA$/i.test(cleanAa)) {
        steps.push(`${txHex} (raw ATCAF0+ATH1 02 27 03 AA..): ${cleanAa}`);
      }
    }
  } catch {
    /* ignore */
  } finally {
    try {
      await elm.sendCommand("ATCAF1");
      await elm.sendCommand("ATH0");
    } catch {
      /* ignore */
    }
    await openEyesightSession(elm, tx, rx);
  }
}

async function testEyesightFlowControl2703(
  elm: SubaruMeterWriteLink,
  tx: number,
  rx: number,
  steps: string[],
  options: { userKeyHex?: string; keyVersionByte: number | null },
  contextLabel?: string,
): Promise<{ unlocked: boolean; lockedOut?: boolean }> {
  const txHex = tx.toString(16).toUpperCase();
  const rxHex = rx.toString(16).toUpperCase();
  try {
    await elm.setCanHeader(tx, rx);
    await elm.sendCommand("ATFCSM0");
    await elm.sendPayload("1003", 1_500);
    const rawFc0 = await elm.sendPayload("2703", 2_500);
    const pFc0 = parseUdsResponse(rawFc0, 0x27);
    const cleanFc0 = rawFc0.replace(/>/g, "").trim();
    steps.push(
      `${txHex}→${rxHex}: тест 27 03 (ATFCSM0${contextLabel ? ` · ${contextLabel}` : ""}) → ${cleanFc0 || "NO DATA"}`,
    );
    if (pFc0.kind === "positive") {
      const u = await unlockSubaruMeterSecurityAccess(elm, tx, rx, steps, {
        userKeyHex: options.userKeyHex,
        keyVersionByte: options.keyVersionByte,
        preferNonMeterAes: true,
        preferEcuKinds: EYESIGHT_PREFERRED_ECU_KINDS,
        maxAesAttempts: 32,
      });
      if (u.unlocked || u.lockedOut) return { unlocked: u.unlocked, lockedOut: u.lockedOut };
    }

    // Also test BS=0, STmin=10ms (30 00 0A) in case ECU dislikes BS=8 (30 08 0A) and STmin=0 (30 00 00)
    await elm.sendCommand(`ATFCSH${tx.toString(16).padStart(3, "0").toUpperCase()}`);
    await elm.sendCommand("ATFCSD30000A");
    await elm.sendCommand("ATFCSM1");
    const rawFc0A = await elm.sendPayload("2703", 1_800);
    const pFc0A = parseUdsResponse(rawFc0A, 0x27);
    const cleanFc0A = rawFc0A.replace(/>/g, "").trim();
    if (cleanFc0A && !/^NO DATA$/i.test(cleanFc0A)) {
      steps.push(`${txHex}→${rxHex}: тест 27 03 (30 00 0A) → ${cleanFc0A}`);
      if (pFc0A.kind === "positive") {
        const u = await unlockSubaruMeterSecurityAccess(elm, tx, rx, steps, {
          userKeyHex: options.userKeyHex,
          keyVersionByte: options.keyVersionByte,
          preferNonMeterAes: true,
          preferEcuKinds: EYESIGHT_PREFERRED_ECU_KINDS,
          maxAesAttempts: 32,
        });
        if (u.unlocked || u.lockedOut) return { unlocked: u.unlocked, lockedOut: u.lockedOut };
      }
    }
  } catch {
    /* ignore */
  } finally {
    try {
      await elm.sendCommand(`ATFCSH${tx.toString(16).padStart(3, "0").toUpperCase()}`);
      await elm.sendCommand("ATFCSD30080A");
      await elm.sendCommand("ATFCSM1");
    } catch {
      /* ignore */
    }
  }
  return { unlocked: false };
}

async function probeEyesight27FallbackAndDiag(
  elm: SubaruMeterWriteLink,
  tx: number,
  rx: number,
  steps: string[],
  options: { userKeyHex?: string; keyVersionByte: number | null },
): Promise<{ unlocked: boolean; lockedOut?: boolean }> {
  const txHex = tx.toString(16).toUpperCase();
  const rxHex = rx.toString(16).toUpperCase();

  await openEyesightSession(elm, tx, rx);

  // 1) Verify multi-frame ISO-TP works on 787->78F via F182/F187/F197/F181/F18E/1902FF
  await probeEyesightMultiFrame(elm, txHex, rxHex, steps);

  // 2) Try ATFCSM0 (ELM default Flow Control) & 30 00 0A in case 787 rejected 30 08 0A for 67 03
  const fcRes = await testEyesightFlowControl2703(elm, tx, rx, steps, options);
  if (fcRes.unlocked || fcRes.lockedOut) return fcRes;

  // 3) True raw CAN sniff on 27 03 (ATCAF0 + ATH1 + ATAR) to distinguish CGW-drop vs malformed ISO-TP
  await probeEyesightRawCan2703(elm, tx, rx, steps, "до AES-CGW");

  // 4) Try 763: 10 03 -> 31 01 02 0C WITHOUT sending 10 01 on CGW (in case 10 01 re-enables 27 filter)
  try {
    await openEyesightSession(elm, 0x763, 0x76b);
    const raw31 = await elm.sendPayload("3101020C", 2_500);
    const p31 = parseUdsResponse(raw31, 0x31);
    steps.push(
      `763→76B: тест 31 01 02 0C (без 10 01) → ${raw31.replace(/>/g, "").trim() || "NO DATA"}`,
    );
    if (p31.kind === "positive") {
      await openEyesightSession(elm, tx, rx);
      const rawSeedKeep = await elm.sendPayload("2703", 2_500);
      const pKeep = parseUdsResponse(rawSeedKeep, 0x27);
      steps.push(
        `${txHex}→${rxHex}: 27 03 при открытой 763 → ${rawSeedKeep.replace(/>/g, "").trim() || "NO DATA"}`,
      );
      if (pKeep.kind === "positive") {
        const u = await unlockSubaruMeterSecurityAccess(elm, tx, rx, steps, {
          userKeyHex: options.userKeyHex,
          keyVersionByte: options.keyVersionByte,
          preferNonMeterAes: true,
          preferEcuKinds: EYESIGHT_PREFERRED_ECU_KINDS,
          maxAesAttempts: 32,
        });
        if (u.unlocked || u.lockedOut) return { unlocked: u.unlocked, lockedOut: u.lockedOut };
      }
      // Close 763 session cleanly
      try {
        await openEyesightSession(elm, 0x763, 0x76b);
        await elm.sendPayload("1001", 800);
      } catch {
        /* ignore */
      }
      await openEyesightSession(elm, tx, rx);
    }
  } catch {
    /* ignore */
  }

  return { unlocked: false };
}

async function closeKeptOpenGateways(
  elm: SubaruMeterWriteLink,
  keptGateways: readonly { tx: number; rx: number }[],
): Promise<void> {
  for (const gw of keptGateways) {
    try {
      await elm.setCanHeader(gw.tx, gw.rx);
      await elm.sendPayload("1001", 800);
    } catch {
      /* ignore */
    }
  }
}

async function escalateCgwKeepOpenAndUnlockEyesight(
  elm: SubaruMeterWriteLink,
  tx: number,
  rx: number,
  steps: string[],
  options: {
    userKeyHex?: string;
    keyVersionByte: number | null;
    maxAesAttempts: number;
    keptGateways: { tx: number; rx: number }[];
    triedAltGateways: { done: boolean };
  },
): Promise<{ unlocked: boolean; seedHex: string | null; cgwFilterRemoved: boolean; lockedOut?: boolean }> {
  const txHex = tx.toString(16).toUpperCase();
  const rxHex = rx.toString(16).toUpperCase();
  let cgwFilterRemoved = false;

  const trackKept = (gw: {
    keptOpen: boolean;
    gatewayTx: number | null;
    gatewayRx: number | null;
  }) => {
    if (
      gw.keptOpen &&
      gw.gatewayTx != null &&
      gw.gatewayRx != null &&
      !options.keptGateways.some((k) => k.tx === gw.gatewayTx)
    ) {
      options.keptGateways.push({ tx: gw.gatewayTx, rx: gw.gatewayRx });
    }
  };

  steps.push(
    `${txHex}→${rxHex}: 27 xx → NO DATA — полная AES-разблокировка CGW 763 (27 07/08 + 31 01 02 00 без 10 01)…`,
  );
  const cgwSa763 = await unlockSubaruCgwFilterRemove(elm, steps, {
    requireSecurityAccess: true,
    targetTxs: [0x763],
    keepGatewayOpen: true,
  });
  if (cgwSa763.filterRemoved) cgwFilterRemoved = true;
  trackKept(cgwSa763);

  await openEyesightSession(elm, tx, rx);
  let u = await unlockSubaruMeterSecurityAccess(elm, tx, rx, steps, {
    userKeyHex: options.userKeyHex,
    keyVersionByte: options.keyVersionByte,
    preferNonMeterAes: true,
    preferEcuKinds: EYESIGHT_PREFERRED_ECU_KINDS,
    maxAesAttempts: options.maxAesAttempts,
  });
  if (u.unlocked || u.seedHex || u.lockedOut) {
    return { ...u, cgwFilterRemoved };
  }

  // While 763 is still kept open in 10 03 + 67 08, test multi-frame, ATFCSM0 & true raw ATCAF0 sniff
  if (cgwSa763.filterRemoved) {
    await probeEyesightMultiFrame(elm, txHex, rxHex, steps);
    const fcKeep = await testEyesightFlowControl2703(
      elm,
      tx,
      rx,
      steps,
      { userKeyHex: options.userKeyHex, keyVersionByte: options.keyVersionByte },
      "763 открыта",
    );
    if (fcKeep.unlocked || fcKeep.lockedOut) {
      return { unlocked: fcKeep.unlocked, seedHex: null, cgwFilterRemoved, lockedOut: fcKeep.lockedOut };
    }
    await probeEyesightRawCan2703(elm, tx, rx, steps, "763 открыта");

    // Also test 31 01 12 01 and 31 01 02 0C inside 763's 67 08 session (keep open, no 10 01)
    const cgwExtra = await unlockSubaruCgwFilterRemove(elm, steps, {
      requireSecurityAccess: true,
      targetTxs: [0x763],
      keepGatewayOpen: true,
      routines: ["31011201", "3101020C"],
    });
    trackKept(cgwExtra);
    if (cgwExtra.filterRemoved) {
      cgwFilterRemoved = true;
      await openEyesightSession(elm, tx, rx);
      const rawProbe = await elm.sendPayload("2703", 2_000);
      const pProbe = parseUdsResponse(rawProbe, 0x27);
      steps.push(
        `${txHex}→${rxHex}: 27 03 после доп. рутины CGW → ${rawProbe.replace(/>/g, "").trim() || "NO DATA"}`,
      );
      if (pProbe.kind !== "empty") {
        u = await unlockSubaruMeterSecurityAccess(elm, tx, rx, steps, {
          userKeyHex: options.userKeyHex,
          keyVersionByte: options.keyVersionByte,
          preferNonMeterAes: true,
          preferEcuKinds: EYESIGHT_PREFERRED_ECU_KINDS,
          maxAesAttempts: options.maxAesAttempts,
        });
        if (u.unlocked || u.seedHex || u.lockedOut) {
          return { ...u, cgwFilterRemoved };
        }
      }
    }
  }

  // Fallback: probe alternate gateway addresses (750, 765) once, and only retry 787 27 xx if one actually unlocked
  if (!options.triedAltGateways.done) {
    options.triedAltGateways.done = true;
    const cgwAlt = await unlockSubaruCgwFilterRemove(elm, steps, {
      targetTxs: [0x750, 0x765],
      keepGatewayOpen: true,
    });
    trackKept(cgwAlt);
    if (cgwAlt.filterRemoved) {
      cgwFilterRemoved = true;
      await openEyesightSession(elm, tx, rx);
      u = await unlockSubaruMeterSecurityAccess(elm, tx, rx, steps, {
        userKeyHex: options.userKeyHex,
        keyVersionByte: options.keyVersionByte,
        preferNonMeterAes: true,
        preferEcuKinds: EYESIGHT_PREFERRED_ECU_KINDS,
        maxAesAttempts: options.maxAesAttempts,
      });
    }
  }

  return { ...u, cgwFilterRemoved };
}

function parseSingleDidBodyHex(raw: string, didHex: string): { ok: boolean; hex: string; nrc?: number } {
  const parsed = parseUdsResponse(raw, 0x22);
  if (parsed.kind === "negative") {
    return { ok: false, hex: "", nrc: parsed.nrc };
  }
  if (parsed.kind !== "positive") {
    return { ok: false, hex: "" };
  }
  const didNum = Number.parseInt(didHex, 16);
  const body =
    parsed.payload.length >= 2 &&
    parsed.payload[0] === ((didNum >> 8) & 0xff) &&
    parsed.payload[1] === (didNum & 0xff)
      ? parsed.payload.slice(2)
      : parsed.payload;
  if (body.length < 1) return { ok: false, hex: "" };
  const hex = body.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  return { ok: true, hex };
}

export async function readSubaruEyesight35xxDids(
  elm: SubaruMeterWriteLink,
  options?: {
    steps?: string[];
    withCgw?: boolean;
    didHexList?: readonly string[];
    securityKeyHex?: string;
    unlockIfNrc33?: boolean;
    unlockBeforeRead?: boolean;
  },
): Promise<{
  tx: number;
  rx: number;
  didMap: Record<string, string>;
  cgwFilterRemoved: boolean;
  securityAccessRequired: boolean;
}> {
  const steps = options?.steps ?? [];
  const didList = options?.didHexList ?? SSM4_YYW_FP_DID_KEYS;
  let cgwFilterRemoved = false;
  let securityAccessRequired = false;

  if (options?.withCgw !== false) {
    try {
      const cgw = await unlockSubaruCgwFilterRemove(elm, steps);
      cgwFilterRemoved = cgw.filterRemoved;
      if (cgw.filterRemoved) {
        steps.push(`${cgw.gatewayLabel ?? "CGW"}: фильтр снят — опрос EyeSight (ADA-032)`);
      } else {
        steps.push("CGW: фильтр не снят (35xx на 787 могут не отвечать)");
      }
    } catch (e) {
      steps.push(`CGW FilterRemove: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const targets = [
    { tx: 0x787, rx: 0x78f, label: "787→78F (SGP EyeSight)" },
    { tx: 0x784, rx: 0x78c, label: "784→78C (legacy EyeSight)" },
  ];

  let best: { tx: number; rx: number; didMap: Record<string, string>; score: number } | null = null;
  const keptGateways: { tx: number; rx: number }[] = [];
  const triedAltGateways = { done: false };
  let lockedOutOnPrimary787 = false;

  const tryReadAllDidsOnOpenTarget = async (
    target: { tx: number; rx: number },
    didMap: Record<string, string>,
  ): Promise<number> => {
    let hits = 0;
    for (const didHexRaw of didList) {
      const didHex = didHexRaw.toUpperCase();
      if (/^309[1-9A-D]$/.test(didHex) && hits >= 8) continue;
      try {
        const raw = await elm.sendPayload(`22${didHex}`, 1_800);
        const res = parseSingleDidBodyHex(raw, didHex);
        if (!res.ok) continue;
        didMap[didHex] = res.hex;
        if (
          (SSM4_YYW_FP_DID_KEYS as readonly string[]).includes(didHex) ||
          /^309[1-9A-D]$/.test(didHex)
        ) {
          hits++;
        }
      } catch {
        /* ignore */
      }
    }
    return hits;
  };

  try {
    for (const target of targets) {
      const txHex = target.tx.toString(16).toUpperCase();
      const rxHex = target.rx.toString(16).toUpperCase();
      const didMap: Record<string, string> = {};
      let score = 0;
      let triedSaOnTarget = false;

      try {
        const sess = await openEyesightSession(elm, target.tx, target.rx);
        steps.push(`${txHex}→${rxHex}: 10 03 → ${sess.raw || "NO DATA"}`);
        try {
          await elm.sendPayload("3E00", 600);
        } catch {
          /* ignore */
        }

        if (options?.unlockBeforeRead) {
          const algo = await readEyesightAlgoByte(elm);
          if (algo != null) {
            steps.push(
              `${txHex}→${rxHex}: 22 02 50 → Algo=${algo} (0x${algo.toString(16).padStart(2, "0").toUpperCase()})`,
            );
          }
          const kv = await readEyesightKeyVersionByte(elm);
          if (kv != null) {
            steps.push(
              `${txHex}→${rxHex}: 22 02 51 → KeyVersion=${kv} (0x${kv.toString(16).padStart(2, "0").toUpperCase()})`,
            );
          }
          triedSaOnTarget = true;
          const u = await unlockSubaruMeterSecurityAccess(elm, target.tx, target.rx, steps, {
            userKeyHex: options.securityKeyHex,
            keyVersionByte: kv,
            preferNonMeterAes: true,
            preferEcuKinds: EYESIGHT_PREFERRED_ECU_KINDS,
            maxAesAttempts: 32,
          });
          if (!u.unlocked) securityAccessRequired = true;
          if (u.lockedOut && target.tx === 0x787) lockedOutOnPrimary787 = true;
        }

        for (let i = 0; i < didList.length; i++) {
          if (lockedOutOnPrimary787) break;
          const didHex = didList[i]!.toUpperCase();
          // Skip legacy 3091..309D DIDs when SGP 3501..3510 already answered
          if (/^309[1-9A-D]$/.test(didHex) && score >= 8) continue;
          try {
            let raw = await elm.sendPayload(`22${didHex}`, 1_800);
            let res = parseSingleDidBodyHex(raw, didHex);
            if (!res.ok && res.nrc === 0x33 && (options?.unlockIfNrc33 ?? true) && !triedSaOnTarget) {
              triedSaOnTarget = true;
              steps.push(`${txHex}→${rxHex}: 22 ${didHex} → NRC 33, выполняем SecurityAccess (ADA-032 C11)…`);
              const algo = await readEyesightAlgoByte(elm);
              if (algo != null) {
                steps.push(
                  `${txHex}→${rxHex}: 22 02 50 → Algo=${algo} (0x${algo.toString(16).padStart(2, "0").toUpperCase()})`,
                );
              }
              const kv = await readEyesightKeyVersionByte(elm);
              if (kv != null) {
                steps.push(
                  `${txHex}→${rxHex}: 22 02 51 → KeyVersion=${kv} (0x${kv.toString(16).padStart(2, "0").toUpperCase()})`,
                );
              }
              let u = await unlockSubaruMeterSecurityAccess(elm, target.tx, target.rx, steps, {
                userKeyHex: options?.securityKeyHex,
                keyVersionByte: kv,
                preferNonMeterAes: true,
                preferEcuKinds: EYESIGHT_PREFERRED_ECU_KINDS,
                maxAesAttempts: 32,
                seedPairs:
                  options?.withCgw !== false && target.tx === 0x787
                    ? [{ seedSub: "2703", keySub: "2704", level: 3 }]
                    : undefined,
                stopOnSeedNoData: options?.withCgw !== false && target.tx === 0x787,
              });
              if (!u.unlocked && !u.seedHex && !u.lockedOut && options?.withCgw !== false) {
                const esc = await escalateCgwKeepOpenAndUnlockEyesight(
                  elm,
                  target.tx,
                  target.rx,
                  steps,
                  {
                    userKeyHex: options?.securityKeyHex,
                    keyVersionByte: kv,
                    maxAesAttempts: 32,
                    keptGateways,
                    triedAltGateways,
                  },
                );
                if (esc.cgwFilterRemoved) cgwFilterRemoved = true;
                u = { unlocked: esc.unlocked, seedHex: esc.seedHex, lockedOut: esc.lockedOut };
              }
              if (!u.unlocked && !u.seedHex && !u.lockedOut && options?.withCgw !== false) {
                const diag = await probeEyesight27FallbackAndDiag(elm, target.tx, target.rx, steps, {
                  userKeyHex: options?.securityKeyHex,
                  keyVersionByte: kv,
                });
                if (diag.unlocked || diag.lockedOut) {
                  u = { unlocked: diag.unlocked, seedHex: null, lockedOut: diag.lockedOut };
                }
              }
              if (u.lockedOut && target.tx === 0x787) {
                lockedOutOnPrimary787 = true;
              }
              if (u.unlocked) {
                raw = await elm.sendPayload(`22${didHex}`, 1_800);
                res = parseSingleDidBodyHex(raw, didHex);
              } else {
                securityAccessRequired = true;
              }
            } else if (!res.ok && res.nrc === 0x33) {
              securityAccessRequired = true;
            }
            if (!res.ok) continue;
            didMap[didHex] = res.hex;
            if (
              (SSM4_YYW_FP_DID_KEYS as readonly string[]).includes(didHex) ||
              /^309[1-9A-D]$/.test(didHex)
            ) {
              score++;
            }
          } catch {
            /* ignore */
          }
        }

        // If 35xx returned 0 hits on 787 and we haven't tried proactive ADA-032 SecurityAccess + 763/750 CGW unlock yet, escalate now.
        if (score === 0 && !triedSaOnTarget && !lockedOutOnPrimary787 && target.tx === 0x787) {
          triedSaOnTarget = true;
          steps.push(`${txHex}→${rxHex}: 3501..3510 не ответили — пробуем ADA-032 SecurityAccess и CGW 763/750…`);
          await openEyesightSession(elm, target.tx, target.rx);
          const kv = await readEyesightKeyVersionByte(elm);
          if (kv != null) {
            steps.push(
              `${txHex}→${rxHex}: 22 02 51 → KeyVersion=${kv} (0x${kv.toString(16).padStart(2, "0").toUpperCase()})`,
            );
          }
          let u: { unlocked: boolean; seedHex: string | null; lockedOut?: boolean } = {
            unlocked: false,
            seedHex: null,
          };
          if (options?.withCgw !== false) {
            const esc = await escalateCgwKeepOpenAndUnlockEyesight(
              elm,
              target.tx,
              target.rx,
              steps,
              {
                userKeyHex: options?.securityKeyHex,
                keyVersionByte: kv,
                maxAesAttempts: 32,
                keptGateways,
                triedAltGateways,
              },
            );
            if (esc.cgwFilterRemoved) cgwFilterRemoved = true;
            u = { unlocked: esc.unlocked, seedHex: esc.seedHex, lockedOut: esc.lockedOut };
          } else {
            u = await unlockSubaruMeterSecurityAccess(elm, target.tx, target.rx, steps, {
              userKeyHex: options?.securityKeyHex,
              keyVersionByte: kv,
              preferNonMeterAes: true,
              preferEcuKinds: EYESIGHT_PREFERRED_ECU_KINDS,
              maxAesAttempts: 32,
            });
          }
          if (u.lockedOut) lockedOutOnPrimary787 = true;
          if (u.unlocked) {
            score = await tryReadAllDidsOnOpenTarget(target, didMap);
          } else {
            securityAccessRequired = true;
          }
        }

        try {
          await elm.sendPayload("1001", 600);
        } catch {
          /* ignore */
        }
        steps.push(`${target.label}: считано variant DID ${score}/${SSM4_YYW_FP_DID_KEYS.length}`);
        if (!best || score > best.score) {
          best = { tx: target.tx, rx: target.rx, didMap, score };
        }
        if (score > 0 || lockedOutOnPrimary787) break;
      } catch (e) {
        steps.push(`${txHex}→${rxHex}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Last-resort CAN ID auto-discovery if both 787 and 784 yielded 0/16 variant DIDs (skip when 787 already responded and locked SA)
    if ((!best || best.score === 0) && !lockedOutOnPrimary787 && options?.withCgw !== false) {
      const open787 = await probeEyesightWithOpenRx(elm, 0x787, steps);
      if (open787 && open787.rx !== 0x78f) {
        const discovered = { tx: 0x787, rx: open787.rx };
        const didMap: Record<string, string> = {};
        await openEyesightSession(elm, discovered.tx, discovered.rx);
        const kv = await readEyesightKeyVersionByte(elm);
        const u = await unlockSubaruMeterSecurityAccess(elm, discovered.tx, discovered.rx, steps, {
          userKeyHex: options?.securityKeyHex,
          keyVersionByte: kv,
          preferNonMeterAes: true,
          preferEcuKinds: EYESIGHT_PREFERRED_ECU_KINDS,
          maxAesAttempts: 32,
        });
        if (u.unlocked) {
          const hits = await tryReadAllDidsOnOpenTarget(discovered, didMap);
          if (hits > 0) best = { ...discovered, didMap, score: hits };
        }
        try {
          await elm.sendPayload("1001", 500);
        } catch {
          /* ignore */
        }
      }

      if (!best || best.score === 0) {
        try {
          await elm.sendCommand("ATST19");
        } catch {
          /* ignore */
        }
        try {
          for (const cand of EYESIGHT_DISCOVERY_CANDIDATES) {
            try {
              const sess = await openEyesightSession(elm, cand.tx, cand.rx);
              if (!sess.ok) continue;
              const probe3501 = await elm.sendPayload("223501", 900);
              const p3501 = parseSingleDidBodyHex(probe3501, "3501");
              steps.push(`${cand.label}: откликнулся на 10 03 (22 3501 → ${probe3501.replace(/>/g, "").trim()})`);
              if (p3501.ok || p3501.nrc === 0x33) {
                const didMap: Record<string, string> = {};
                if (p3501.nrc === 0x33) {
                  const kv = await readEyesightKeyVersionByte(elm);
                  await unlockSubaruMeterSecurityAccess(elm, cand.tx, cand.rx, steps, {
                    userKeyHex: options?.securityKeyHex,
                    keyVersionByte: kv,
                    preferNonMeterAes: true,
                    preferEcuKinds: EYESIGHT_PREFERRED_ECU_KINDS,
                    maxAesAttempts: 32,
                  });
                }
                const hits = await tryReadAllDidsOnOpenTarget(cand, didMap);
                if (hits > 0) {
                  best = { tx: cand.tx, rx: cand.rx, didMap, score: hits };
                  try {
                    await elm.sendPayload("1001", 500);
                  } catch {
                    /* ignore */
                  }
                  break;
                }
              }
              try {
                await elm.sendPayload("1001", 400);
              } catch {
                /* ignore */
              }
            } catch {
              /* ignore */
            }
          }
        } finally {
          try {
            await elm.sendCommand("ATSTFF");
          } catch {
            /* ignore */
          }
        }
      }
    }
  } finally {
    await closeKeptOpenGateways(elm, keptGateways);
  }

  if (!best) {
    return { tx: 0x787, rx: 0x78f, didMap: {}, cgwFilterRemoved, securityAccessRequired };
  }
  return {
    tx: best.tx,
    rx: best.rx,
    didMap: best.didMap,
    cgwFilterRemoved,
    securityAccessRequired,
  };
}

/**
 * Resolve 3502 Destination byte for `region-only` mode when Applied+Option isn't in Y-Yw (e.g. U45L).
 */
function infer3502RegionByte(
  appliedModel: string,
  optionCode: string,
): string | null {
  const row = lookupSsm4YywFingerprint(appliedModel, optionCode);
  if (row && row.fp.length >= 4) {
    return row.fp.slice(2, 4).toUpperCase();
  }
  const dest = optionCode.trim().toUpperCase().slice(0, 2);
  if (dest === "C0") return "30";
  if (dest === "C5") return "31";
  if (dest === "U4") return "20";
  if (dest === "U5") return "21";
  return null;
}

/**
 * SSM4 ADA-031 (`Selection of Parameter` / Vehicle Model Registration) on EyeSight 787→78F (or 784→78C).
 * Supports:
 * - `full-yyw` (default): writes all 16 DIDs (`3501..3510`, exact ADA-031 + `ReadWriteDidListData`) from Y-Yw and verifies every byte.
 * - `region-only`: writes only `3502` (Destination region byte: `20/21`=US, `30/31`=CA), preserving `3501, 3503..3510`.
 * - `custom-35xx`: writes exact saved 1-byte variant DIDs (`3501..3510` / `3091..309D`) for 1:1 original backup restoration.
 */
export async function writeSubaruEyesightVariantByApplied(
  elm: SubaruMeterWriteLink,
  appliedModel: string,
  optionCode: string,
  securityKeyHex?: string,
  options?: {
    writeMode?: SubaruEyesightWriteMode;
    customWrites?: SubaruEyesightWriteEntry[];
    txHex?: string;
    rxHex?: string;
  },
): Promise<SubaruEyesightVariantWriteResult> {
  const app = appliedModel.trim().toUpperCase();
  const opt = optionCode.trim().toUpperCase();
  const writeMode: SubaruEyesightWriteMode = options?.writeMode ?? "full-yyw";

  const steps: string[] = [
    `SSM4 ADA-031 Selection of Parameter (${writeMode}): ${app}+${opt} (Y-YwPHBWHoZ.mLW)`,
  ];

  let writeTargets: { did: string; byteHex: string }[] = [];

  if (writeMode === "custom-35xx") {
    const rawList = options?.customWrites ?? [];
    if (rawList.length === 0) {
      return {
        success: false,
        writeMode,
        steps: [...steps, "Список DID для восстановления оригинала EyeSight пуст."],
        appliedModel: app,
        optionCode: opt,
        writtenCount: 0,
        targetCount: 0,
        verifiedCount: 0,
        mismatchedDids: [],
        afterDidMap: {},
        securityAccessRequired: false,
        cgwFilterRemoved: false,
      };
    }
    for (const entry of rawList) {
      const did = entry.did.trim().toUpperCase();
      const byteHex = entry.byteHex.trim().toUpperCase();
      if (!isWritableEyesightVariantDid(did) || !/^[0-9A-F]{2}$/.test(byteHex)) {
        return {
          success: false,
          writeMode,
          steps: [...steps, `Недопустимый DID в бэкапе EyeSight: ${did}=${byteHex}. Запись остановлена.`],
          appliedModel: app,
          optionCode: opt,
          writtenCount: 0,
          targetCount: 0,
          verifiedCount: 0,
          mismatchedDids: [],
          afterDidMap: {},
          securityAccessRequired: false,
          cgwFilterRemoved: false,
        };
      }
      writeTargets.push({ did, byteHex });
    }
    steps.push(`Восстановление оригинала EyeSight 1:1: подготовлено ${writeTargets.length} DID.`);
  } else if (writeMode === "region-only") {
    const b3502 = infer3502RegionByte(app, opt);
    if (!b3502) {
      return {
        success: false,
        writeMode,
        steps: [...steps, `Не удалось определить байт региона 3502 для ${app}+${opt}.`],
        appliedModel: app,
        optionCode: opt,
        writtenCount: 0,
        targetCount: 0,
        verifiedCount: 0,
        mismatchedDids: [],
        afterDidMap: {},
        securityAccessRequired: false,
        cgwFilterRemoved: false,
      };
    }
    writeTargets = [{ did: "3502", byteHex: b3502 }];
    steps.push(
      `Безопасный минимум (только регион): пишется DID 3502=${b3502}, остальные DID (3501, 3503..3510) сохраняются.`,
    );
  } else {
    const yywDids = getSsm4YywWriteDids(app, opt);
    if (!yywDids || yywDids.length === 0) {
      return {
        success: false,
        writeMode,
        steps: [
          ...steps,
          `Пары ${app}+${opt} нет в справочнике Y-YwPHBWHoZ.mLW. Полная запись всех 16 DID невозможна — выберите код из Y-Yw (например C0QF/U45D), режим «Только регион (3502)» или бэкап.`,
        ],
        appliedModel: app,
        optionCode: opt,
        writtenCount: 0,
        targetCount: 0,
        verifiedCount: 0,
        mismatchedDids: [],
        afterDidMap: {},
        securityAccessRequired: false,
        cgwFilterRemoved: false,
      };
    }
    writeTargets = yywDids;
    steps.push(
      `Полная запись SSM4 ADA-031: подготовлено ${writeTargets.length} DID (3501..350A + ReadWriteDidListData 350B..3510).`,
    );
  }

  let cgwFilterRemoved = false;
  try {
    const cgw = await unlockSubaruCgwFilterRemove(elm, steps);
    cgwFilterRemoved = cgw.filterRemoved;
    if (cgwFilterRemoved) {
      steps.push(`${cgw.gatewayLabel ?? "CGW"}: SID-фильтр снят — переключаемся на EyeSight`);
    } else {
      steps.push("CGW: SID-фильтр не подтверждён (возможны NRC 33 / NO DATA на 27 xx)");
    }
  } catch (e) {
    steps.push(`CGW: ${e instanceof Error ? e.message : String(e)}`);
  }

  const parsedTx = options?.txHex ? Number.parseInt(options.txHex, 16) : NaN;
  const parsedRx = options?.rxHex ? Number.parseInt(options.rxHex, 16) : NaN;
  const tx = Number.isFinite(parsedTx) ? parsedTx : 0x787;
  const rx = Number.isFinite(parsedRx) ? parsedRx : 0x78f;
  const txHex = tx.toString(16).toUpperCase();
  const rxHex = rx.toString(16).toUpperCase();
  let securityAccessRequired = false;
  let writtenCount = 0;

  const keptGateways: { tx: number; rx: number }[] = [];
  const triedAltGateways = { done: false };
  const afterDidMap: Record<string, string> = {};
  const mismatchedDids: string[] = [];
  let verifiedCount = 0;

  try {
    await openEyesightSession(elm, tx, rx);
    steps.push(`${txHex}→${rxHex}: расширенная сессия EyeSight открыта (10 03)`);

    // ADA-031 Block B01 C11: run SecurityAccessExecute right after 10 03 (before 2E 35 01..10)
    const keyVer = await readEyesightKeyVersionByte(elm);
    if (keyVer != null) {
      steps.push(
        `${txHex}→${rxHex}: версия ключа 22 02 51 → ${keyVer.toString(16).padStart(2, "0").toUpperCase()}`,
      );
    }
    let initialUnlock = await unlockSubaruMeterSecurityAccess(elm, tx, rx, steps, {
      userKeyHex: securityKeyHex,
      keyVersionByte: keyVer,
      preferNonMeterAes: true,
      preferEcuKinds: EYESIGHT_PREFERRED_ECU_KINDS,
      maxAesAttempts: 16,
      seedPairs: [{ seedSub: "2703", keySub: "2704", level: 3 }],
      stopOnSeedNoData: true,
    });
    if (!initialUnlock.unlocked && !initialUnlock.seedHex && !initialUnlock.lockedOut) {
      const esc = await escalateCgwKeepOpenAndUnlockEyesight(elm, tx, rx, steps, {
        userKeyHex: securityKeyHex,
        keyVersionByte: keyVer,
        maxAesAttempts: 16,
        keptGateways,
        triedAltGateways,
      });
      if (esc.cgwFilterRemoved) cgwFilterRemoved = true;
      initialUnlock = { unlocked: esc.unlocked, seedHex: esc.seedHex, lockedOut: esc.lockedOut };
    }
    if (!initialUnlock.unlocked && !initialUnlock.seedHex && !initialUnlock.lockedOut) {
      const diag = await probeEyesight27FallbackAndDiag(elm, tx, rx, steps, {
        userKeyHex: securityKeyHex,
        keyVersionByte: keyVer,
      });
      if (diag.unlocked || diag.lockedOut) {
        initialUnlock = { unlocked: diag.unlocked, seedHex: null, lockedOut: diag.lockedOut };
      }
    }

    const saUnlocked = initialUnlock.unlocked;
    let triedRetrySa = saUnlocked || Boolean(initialUnlock.lockedOut);
    if (initialUnlock.lockedOut) {
      securityAccessRequired = true;
    }

    for (const item of writeTargets) {
      if (initialUnlock.lockedOut) break;
      const payload = `2E${item.did}${item.byteHex}`;
      let raw = await elm.sendPayload(payload, 2_500);
      let parsed = parseUdsResponse(raw, 0x2e);
      if (parsed.kind === "negative" && parsed.nrc === 0x33 && !triedRetrySa) {
        triedRetrySa = true;
        steps.push(`${txHex}: 2E ${item.did} ${item.byteHex} → NRC 33, повтор SecurityAccess…`);
        const u = await unlockSubaruMeterSecurityAccess(elm, tx, rx, steps, {
          userKeyHex: securityKeyHex,
          keyVersionByte: keyVer,
          preferNonMeterAes: true,
          preferEcuKinds: EYESIGHT_PREFERRED_ECU_KINDS,
          maxAesAttempts: 16,
        });
        if (u.unlocked) {
          raw = await elm.sendPayload(payload, 2_500);
          parsed = parseUdsResponse(raw, 0x2e);
        }
      }
      const clean = raw.replace(/>/g, "").trim() || "нет ответа";
      steps.push(
        `${txHex}: 2E ${item.did} ${item.byteHex} → ${clean}` +
          (parsed.kind === "negative" ? ` (${parsed.nrcText ?? "NRC"})` : ""),
      );
      if (parsed.kind === "positive") {
        writtenCount++;
      } else if (parsed.kind === "negative" && parsed.nrc === 0x33) {
        securityAccessRequired = true;
      }
    }

    // ADA-031 Blocks B08-B09: re-read all written DIDs inside the session before 10 01 and compare byte-by-byte
    const verifyDids =
      writeMode === "region-only"
        ? [...SSM4_YYW_FP_DID_KEYS]
        : writeTargets.map((w) => w.did);

    for (const didHex of verifyDids) {
      try {
        const raw = await elm.sendPayload(`22${didHex}`, 1_200);
        const res = parseSingleDidBodyHex(raw, didHex);
        if (res.ok) afterDidMap[didHex] = res.hex;
      } catch {
        /* ignore */
      }
    }

    for (const item of writeTargets) {
      const got = (afterDidMap[item.did] ?? "").split(/\s+/)[0]?.slice(0, 2) ?? "";
      if (got === item.byteHex) {
        verifiedCount++;
      } else {
        mismatchedDids.push(`${item.did} (ожидали ${item.byteHex}, считали ${got || "--"})`);
      }
    }

    try {
      await elm.sendPayload("1001", 800);
      steps.push(`${txHex}→${rxHex}: сессия закрыта (10 01)`);
    } catch {
      /* ignore */
    }
  } finally {
    await closeKeptOpenGateways(elm, keptGateways);
  }

  if (mismatchedDids.length > 0) {
    steps.push(`Сверка ADA-031 B09: расхождения — ${mismatchedDids.join("; ")}`);
  } else if (writeTargets.length > 0) {
    steps.push(
      `Сверка ADA-031 B09: все ${verifiedCount}/${writeTargets.length} DID подтверждены в блоке ${txHex}.`,
    );
  }

  const success =
    writeTargets.length > 0 &&
    writtenCount === writeTargets.length &&
    verifiedCount === writeTargets.length &&
    !securityAccessRequired;

  return {
    success,
    writeMode,
    steps,
    appliedModel: app,
    optionCode: opt,
    writtenCount,
    targetCount: writeTargets.length,
    verifiedCount,
    mismatchedDids,
    afterDidMap,
    securityAccessRequired,
    cgwFilterRemoved,
  };
}
