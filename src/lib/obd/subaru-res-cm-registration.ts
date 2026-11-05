import { parseUdsResponse } from "./uds";

export interface SubaruResLink {
  sendCommand(command: string, timeoutMs?: number): Promise<string>;
  setCanHeader(tx: number, rx?: number): Promise<void>;
  sendPayload(hexPayload: string, timeoutMs?: number): Promise<string>;
}

/**
 * SSM4 `IMM-000.srp` + `IMM-071.srp` / `IMM-017.srp` / `IMM-064.srp` / `IMM-005.srp`
 * decrypted from `SUBARU/CONF/*.srp` via `FHIUtilityNK.dll` (`CclsDecrypt`).
 *
 * Push-button start (H-type / D-type):
 * - H-type (SGP, `7B4->7BC`, `IMM-071` FuncId 40718/40789): `10 03` -> `27 07`/`27 08` -> **`2E 11 B0 01`** -> `6E 11 B0` -> `10 01`
 *   (in `IMM-000` B50 SSM4 first runs `cgwChkAndFilterRemove` with `0763`).
 * - D-type (`751->759`, `IMM-017` FuncId 40195): `10 03` -> `27 03`/`27 04` -> **`2E 11 B0 01`** -> `6E 11 B0` -> `10 01`.
 *
 * Key start (G-type / B-type on BIU `752->75A`, `IMM-064` / `IMM-005`):
 * - **`31 01 40 05`** -> poll **`31 03 40 05`** until `71 03 40 05 00 02` -> `10 01`.
 *
 * `IMM-072` / `IMM-052` (`2E 11 B2 01`, `ImbTlmCuRegist`) is **Telematics CM Registration** (slot 7), NOT RES (slot 6).
 */
export const SUBARU_RES_CM_SAFE_PATH = {
  ssm4MenuEn: "Remote Engine Start CM Registration",
  ssm4Type: "H-type (7B4) / D-type (751) Push Start · B/G-type (752) Key Start",
  region: "NA / US",
  talkTx: ["7B4", "751", "752", "750"] as const,
  pushStartWriteFrame: "2E11B001",
  keyStartRoutineStart: "31014005",
  keyStartRoutineResult: "31034005",
  stis: "S1108BE §9-7 / §5-7 / §4-6 / §8-6",
  forbidden: ["keyDeleteAS1 (31014004/31014006)", "writeCommonArea", "ImbTlmCuRegist (2E11B201)"] as const,
} as const;

/** Never send on the RES path: key-delete (`31014004`/`4006`), guessed RIDs, or Telematics (`2E11B201`). */
export const SUBARU_RES_BLOCKED_PAYLOADS = [
  "31010201",
  "31010202",
  "31010301",
  "31010302",
  "31010601",
  "31010701",
  "31010801",
  "31010901",
  "31014004",
  "31014006",
  "2E11B2",
  "2E11B201",
  "2E11C101",
  "2E11C102",
  "2E11E101",
] as const;

const RES_PROBE_TARGETS: { tx: number; rx: number; titleRu: string }[] = [
  { tx: 0x7b4, rx: 0x7bc, titleRu: "Smart Key / Keyless Access SGP H-type (7B4 · IMM-071)" },
  { tx: 0x751, rx: 0x759, titleRu: "Keyless Access D-type (751 · IMM-017)" },
  { tx: 0x752, rx: 0x75a, titleRu: "Body Integrated Unit BIU (752 · IMM-005/064)" },
  { tx: 0x750, rx: 0x758, titleRu: "Keyless / CGW (750)" },
];

export interface SubaruResProbeModule {
  txHex: string;
  rxHex: string;
  titleRu: string;
  responded: boolean;
  partNumber: string | null;
  systemName: string | null;
  noteRu: string;
}

export interface SubaruResProbeResult {
  steps: string[];
  modules: SubaruResProbeModule[];
  keylessOk: boolean;
  biuOk: boolean;
}

export type SubaruResSystemType = "auto" | "h-type-7b4" | "d-type-751" | "key-biu-752";

export interface SubaruResRegistrationOptions {
  /** Select specific SSM4 immobilizer type (`PopUpImmMenuTypeSel`) or `"auto"` to probe in order. */
  systemType?: SubaruResSystemType;
  /** Optional 4-byte (`27 04`) or 16-byte (`27 08`) SecurityAccess key if the ECU requests a non-zero seed. */
  securityKeyHex?: string;
}

export interface SubaruResRegistrationResult {
  success: boolean;
  steps: string[];
  acceptedPayload: string | null;
  acceptedTx: string | null;
  securityAccessRequired: boolean;
  seedHex?: string | null;
}

function cleanHex(value: string): string {
  return value.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function assertResPayload(payloadHex: string): void {
  const clean = cleanHex(payloadHex);
  if ((SUBARU_RES_BLOCKED_PAYLOADS as readonly string[]).includes(clean)) {
    throw new Error(`Запрещённый кадр для RES CM Registration: ${clean}`);
  }
}

function asciiFromPayload(bytes: number[]): string {
  return bytes
    .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ""))
    .join("")
    .trim();
}

function didBody(parsed: ReturnType<typeof parseUdsResponse>, didHex: string): number[] {
  const didNum = Number.parseInt(didHex, 16);
  if (
    parsed.payload.length >= 2 &&
    parsed.payload[0] === ((didNum >> 8) & 0xff) &&
    parsed.payload[1] === (didNum & 0xff)
  ) {
    return parsed.payload.slice(2);
  }
  return parsed.payload;
}

async function attachIsoTp(elm: SubaruResLink, tx: number, rx: number): Promise<void> {
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
}

async function openSession(elm: SubaruResLink, tx: number, rx: number): Promise<ReturnType<typeof parseUdsResponse>> {
  await attachIsoTp(elm, tx, rx);
  const raw = await elm.sendPayload("1003", 2_000);
  return parseUdsResponse(raw, 0x10);
}

async function closeSession(elm: SubaruResLink): Promise<void> {
  try {
    await elm.sendPayload("1001", 1_000);
  } catch {
    /* ignore */
  }
}

/** Read-only probe on `7B4` (H-type), `751` (D-type), `752` (BIU), and `750`. No 27/2E/31. */
export async function probeSubaruResCm(elm: SubaruResLink): Promise<SubaruResProbeResult> {
  const steps: string[] = [
    "SSM4 F2: опрос блоков RES CM Registration — 7B4 (H-type IMM-071), 751 (D-type IMM-017), 752 (BIU IMM-005/064), 750.",
  ];
  const modules: SubaruResProbeModule[] = [];

  try {
    await elm.sendCommand("ATST20");
  } catch {
    /* ignore */
  }

  for (const target of RES_PROBE_TARGETS) {
    const txHex = target.tx.toString(16).toUpperCase();
    const rxHex = target.rx.toString(16).toUpperCase();
    let responded = false;
    let partNumber: string | null = null;
    let systemName: string | null = null;
    let noteRu = "Нет ответа";
    try {
      await attachIsoTp(elm, target.tx, target.rx);
      const raw3e = await elm.sendPayload("3E00", 700);
      const p3e = parseUdsResponse(raw3e, 0x3e);
      if (p3e.kind === "positive") {
        responded = true;
        noteRu = "7E 00 (на шине)";
      }
      try {
        await elm.sendPayload("1003", 1_000);
      } catch {
        /* ignore */
      }
      const raw = await elm.sendPayload("22F18E", 1_000);
      const parsed = parseUdsResponse(raw, 0x22);
      if (parsed.kind === "positive") {
        responded = true;
        partNumber = asciiFromPayload(didBody(parsed, "F18E")) || null;
        noteRu = partNumber ? `F18E ${partNumber}` : "62 F18E";
      } else if (!responded && parsed.kind === "negative") {
        responded = true;
        noteRu = `NRC ${parsed.nrcText ?? ""}`;
      }
      if (responded) {
        try {
          const rawName = await elm.sendPayload("22F197", 900);
          const pName = parseUdsResponse(rawName, 0x22);
          if (pName.kind === "positive") {
            systemName = asciiFromPayload(didBody(pName, "F197")) || null;
          }
        } catch {
          /* optional */
        }
      }
      steps.push(`${txHex}→${rxHex} (${target.titleRu}): ${noteRu}`);
    } catch (error) {
      noteRu = error instanceof Error ? error.message : String(error);
      steps.push(`${txHex}→${rxHex}: ${noteRu}`);
    }
    modules.push({ txHex, rxHex, titleRu: target.titleRu, responded, partNumber, systemName, noteRu });
  }

  try {
    await closeSession(elm);
  } catch {
    /* ignore */
  }
  try {
    await elm.sendCommand("ATSTFF");
  } catch {
    /* ignore */
  }

  return {
    steps,
    modules,
    keylessOk: modules.some((m) => (m.txHex === "7B4" || m.txHex === "751" || m.txHex === "750") && m.responded),
    biuOk: modules.some((m) => m.txHex === "752" && m.responded),
  };
}

function isZeroSeed(seed: number[]): boolean {
  return seed.length > 0 && seed.every((b) => b === 0);
}

/**
 * Executes the exact SSM4 RES CM Registration frame from decrypted `IMM-071.srp` / `IMM-017.srp` / `IMM-005.srp`:
 * - Push Start (`7B4→7BC` or `751→759`): `10 03` -> (`27 07`/`27 03` if locked) -> **`2E 11 B0 01`** -> `6E 11 B0` -> `10 01`.
 * - Key Start BIU (`752→75A`): `10 03` -> **`31 01 40 05`** -> **`31 03 40 05`** -> `10 01`.
 */
export async function registerSubaruResCm(
  elm: SubaruResLink,
  options: SubaruResRegistrationOptions = {},
): Promise<SubaruResRegistrationResult> {
  const systemType: SubaruResSystemType = options.systemType ?? "auto";
  const steps: string[] = [
    `SSM4 RES CM Registration (режим: ${systemType}): Push-Start IMM-071 (7B4) / IMM-017 (751) → 2E 11 B0 01; Key-Start IMM-005/064 (752) → 31 01 40 05.`,
  ];
  const userKey = options.securityKeyHex ? cleanHex(options.securityKeyHex) : "";

  try {
    await elm.sendCommand("ATSTFF");
  } catch {
    /* ignore */
  }

  let securityAccessRequired = false;
  let seedHex: string | null = null;

  // 1. Push-Start targets (H-type 7B4->7BC, D-type 751->759, fallback 750->758): write 2E 11 B0 01
  const allPushTargets: {
    id: SubaruResSystemType;
    tx: number;
    rx: number;
    label: string;
    seedSub: "2707" | "2703";
    keySub: "2708" | "2704";
  }[] = [
    { id: "h-type-7b4", tx: 0x7b4, rx: 0x7bc, label: "7B4→7BC (H-type Smart Key · IMM-071)", seedSub: "2707", keySub: "2708" },
    { id: "d-type-751", tx: 0x751, rx: 0x759, label: "751→759 (D-type Keyless · IMM-017)", seedSub: "2703", keySub: "2704" },
    { id: "auto", tx: 0x750, rx: 0x758, label: "750→758 (Keyless)", seedSub: "2707", keySub: "2708" },
  ];

  const pushTargets =
    systemType === "auto"
      ? allPushTargets
      : systemType === "key-biu-752"
        ? []
        : allPushTargets.filter((t) => t.id === systemType);

  for (const target of pushTargets) {
    try {
      const s10 = await openSession(elm, target.tx, target.rx);
      if (s10.kind !== "positive") {
        if (systemType !== "auto") {
          steps.push(`${target.label}: нет ответа 50 03 (проверьте выбранный тип системы и зажигание IG ON).`);
        }
        continue;
      }
      steps.push(`${target.label}: сессия 10 03 открыта (50 03)`);

      // Check seed as in IMM-071 C02 / IMM-017 C02
      const rawSeed = await elm.sendPayload(target.seedSub, 2_000);
      const pSeed = parseUdsResponse(rawSeed, 0x27);
      if (pSeed.kind === "positive") {
        const subByte = Number.parseInt(target.seedSub.slice(2), 16);
        const seedBytes = pSeed.payload[0] === subByte ? pSeed.payload.slice(1) : pSeed.payload;
        if (!isZeroSeed(seedBytes)) {
          seedHex = bytesToHex(seedBytes);
          steps.push(`${target.label}: получен Seed ${target.seedSub} (${seedBytes.length} байт) = ${seedHex}`);
          if (userKey && userKey.length === seedBytes.length * 2) {
            const rawKey = await elm.sendPayload(`${target.keySub}${userKey}`, 2_500);
            const pKey = parseUdsResponse(rawKey, 0x27);
            steps.push(`${target.label}: ${target.keySub} → ${rawKey.replace(/>/g, "").trim()}`);
            if (pKey.kind !== "positive") {
              securityAccessRequired = true;
              continue;
            }
          }
        } else {
          steps.push(`${target.label}: Seed ${target.seedSub} нулевой — доступ уже открыт`);
        }
      }

      assertResPayload(SUBARU_RES_CM_SAFE_PATH.pushStartWriteFrame);
      const rawWrite = await elm.sendPayload(SUBARU_RES_CM_SAFE_PATH.pushStartWriteFrame, 7_000);
      const pWrite = parseUdsResponse(rawWrite, 0x2e);
      const cleanWrite = rawWrite.replace(/>/g, "").trim();
      steps.push(`${target.label}: 2E 11 B0 01 → ${cleanWrite || "нет ответа"}`);

      if (pWrite.kind === "positive") {
        await closeSession(elm);
        steps.push(`${target.label}: 6E 11 B0 подтверждён, сессия 10 01 закрыта. Выключите зажигание (IG OFF).`);
        return {
          success: true,
          steps,
          acceptedPayload: SUBARU_RES_CM_SAFE_PATH.pushStartWriteFrame,
          acceptedTx: target.tx.toString(16).toUpperCase(),
          securityAccessRequired: false,
          seedHex,
        };
      }
      if (pWrite.kind === "negative" && pWrite.nrc === 0x33) {
        securityAccessRequired = true;
        steps.push(`${target.label}: 2E 11 B0 01 вернул NRC 33 (требуется разблокировка 27 07/08 или 27 03/04).`);
      }
      await closeSession(elm);
    } catch {
      /* try next target */
    }
  }

  // 2. Key-Start BIU 752->75A (IMM-005 / IMM-064): 31 01 40 05 -> 31 03 40 05
  if (systemType === "auto" || systemType === "key-biu-752") {
    try {
      const s10 = await openSession(elm, 0x752, 0x75a);
      if (s10.kind === "positive") {
        steps.push("752→75A (BIU · IMM-005/064): сессия 10 03 открыта");
        assertResPayload(SUBARU_RES_CM_SAFE_PATH.keyStartRoutineStart);
        const raw31 = await elm.sendPayload(SUBARU_RES_CM_SAFE_PATH.keyStartRoutineStart, 5_000);
        const p31 = parseUdsResponse(raw31, 0x31);
        steps.push(`752→75A: 31 01 40 05 → ${raw31.replace(/>/g, "").trim() || "нет ответа"}`);
        if (p31.kind === "positive") {
          const rawPoll = await elm.sendPayload(SUBARU_RES_CM_SAFE_PATH.keyStartRoutineResult, 5_000);
          steps.push(`752→75A: 31 03 40 05 → ${rawPoll.replace(/>/g, "").trim() || "нет ответа"}`);
          await closeSession(elm);
          return {
            success: true,
            steps,
            acceptedPayload: SUBARU_RES_CM_SAFE_PATH.keyStartRoutineStart,
            acceptedTx: "752",
            securityAccessRequired: false,
            seedHex,
          };
        }
        if (p31.kind === "negative" && p31.nrc === 0x33) {
          securityAccessRequired = true;
          steps.push("752→75A: 31 01 40 05 вернул NRC 33 SecurityAccess.");
        }
        await closeSession(elm);
      } else if (systemType === "key-biu-752") {
        steps.push("752→75A (BIU): нет ответа 50 03.");
      }
    } catch {
      /* ignore */
    }
  }

  return {
    success: false,
    steps,
    acceptedPayload: null,
    acceptedTx: null,
    securityAccessRequired,
    seedHex,
  };
}
