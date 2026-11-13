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

async function openEyesightSession(elm: SubaruMeterWriteLink, tx: number, rx: number): Promise<void> {
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
    /* ignore */
  }
  await elm.sendPayload("1003", 2_000);
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

  for (const target of targets) {
    const txHex = target.tx.toString(16).toUpperCase();
    const rxHex = target.rx.toString(16).toUpperCase();
    const didMap: Record<string, string> = {};
    let score = 0;
    let triedSaOnTarget = false;

    try {
      await openEyesightSession(elm, target.tx, target.rx);
      try {
        await elm.sendPayload("3E00", 600);
      } catch {
        /* ignore */
      }

      if (options?.unlockBeforeRead) {
        const kv = await readEyesightKeyVersionByte(elm);
        triedSaOnTarget = true;
        const u = await unlockSubaruMeterSecurityAccess(elm, target.tx, target.rx, steps, {
          userKeyHex: options.securityKeyHex,
          keyVersionByte: kv,
          preferNonMeterAes: true,
          preferEcuKinds: [0x03, 0x02, 0x05, 0x0f, 0x01, 0x0d, 0x0e, 0x0c],
          maxAesAttempts: 16,
        });
        if (!u.unlocked) securityAccessRequired = true;
      }

      for (let i = 0; i < didList.length; i++) {
        const didHex = didList[i]!.toUpperCase();
        try {
          let raw = await elm.sendPayload(`22${didHex}`, 1_200);
          let res = parseSingleDidBodyHex(raw, didHex);
          if (!res.ok && res.nrc === 0x33 && (options?.unlockIfNrc33 ?? true) && !triedSaOnTarget) {
            triedSaOnTarget = true;
            steps.push(`${txHex}→${rxHex}: 22 ${didHex} → NRC 33, выполняем SecurityAccess (ADA-032 C11)…`);
            const kv = await readEyesightKeyVersionByte(elm);
            const u = await unlockSubaruMeterSecurityAccess(elm, target.tx, target.rx, steps, {
              userKeyHex: options?.securityKeyHex,
              keyVersionByte: kv,
              preferNonMeterAes: true,
              preferEcuKinds: [0x03, 0x02, 0x05, 0x0f, 0x01, 0x0d, 0x0e, 0x0c],
              maxAesAttempts: 16,
            });
            if (u.unlocked) {
              raw = await elm.sendPayload(`22${didHex}`, 1_200);
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

      try {
        await elm.sendPayload("1001", 600);
      } catch {
        /* ignore */
      }
      steps.push(`${target.label}: считано variant DID ${score}/${SSM4_YYW_FP_DID_KEYS.length}`);
      if (!best || score > best.score) {
        best = { tx: target.tx, rx: target.rx, didMap, score };
      }
      if (score >= 8) break;
    } catch (e) {
      steps.push(`${txHex}→${rxHex}: ${e instanceof Error ? e.message : String(e)}`);
    }
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

  await openEyesightSession(elm, tx, rx);
  steps.push(`${txHex}→${rxHex}: расширенная сессия EyeSight открыта (10 03)`);

  // ADA-031 Block B01 C11: run SecurityAccessExecute right after 10 03 (before 2E 35 01..10)
  const keyVer = await readEyesightKeyVersionByte(elm);
  if (keyVer != null) {
    steps.push(`${txHex}→${rxHex}: версия ключа 22 02 51 → ${keyVer.toString(16).padStart(2, "0").toUpperCase()}`);
  }
  const initialUnlock = await unlockSubaruMeterSecurityAccess(elm, tx, rx, steps, {
    userKeyHex: securityKeyHex,
    keyVersionByte: keyVer,
    preferNonMeterAes: true,
    preferEcuKinds: [0x03, 0x02, 0x05, 0x0f, 0x01, 0x0d, 0x0e, 0x0c],
    maxAesAttempts: 16,
  });

  let saUnlocked = initialUnlock.unlocked;
  let triedRetrySa = saUnlocked;

  for (const item of writeTargets) {
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
        preferEcuKinds: [0x03, 0x02, 0x05, 0x0f, 0x01, 0x0d, 0x0e, 0x0c],
        maxAesAttempts: 16,
      });
      if (u.unlocked) {
        saUnlocked = true;
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
  const afterDidMap: Record<string, string> = {};
  const mismatchedDids: string[] = [];
  let verifiedCount = 0;

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
