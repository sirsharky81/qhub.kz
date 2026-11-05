import { parseUdsResponse } from "./uds";

export interface SubaruResLink {
  sendCommand(command: string, timeoutMs?: number): Promise<string>;
  setCanHeader(tx: number, rx?: number): Promise<void>;
  sendPayload(hexPayload: string, timeoutMs?: number): Promise<string>;
}

/** SSM4 F2 (NA/US) «Remote Engine Start CM Registration» — H-type Push Start / SGP. */
export const SUBARU_RES_CM_SAFE_PATH = {
  ssm4MenuEn: "Remote Engine Start CM Registration",
  ssm4Type: "H-type Push Start (Outback BT / SGP)",
  region: "NA / US",
  talkTx: ["750", "752"] as const,
  scriptHint: "RES-001.srp + IMM F2 (sibling of ImbTlmCuRegist)",
  forbidden: ["keyDeleteAS1", "writeCommonArea", "SecurityAccess2018CY_AesKey invent"] as const,
} as const;

/** Never send these: they belong to key-delete / other IMM procedures. */
export const SUBARU_RES_BLOCKED_PAYLOADS = [
  "31010202",
  "31010302",
  "31010201",
  "31010301",
] as const;

/**
 * RoutineControl candidates for accessory CM bind (menu slot after key-count / before Telematics).
 * Tried in order on Keyless 750, then BIU 752. Stop on first 71.
 */
export const SUBARU_RES_REGISTRATION_CANDIDATES: {
  txHex: string;
  rxHex: string;
  payloadHex: string;
  noteRu: string;
}[] = [
  { txHex: "750", rxHex: "758", payloadHex: "31010601", noteRu: "750 RID 0601 — CM Registration (слот RES)" },
  { txHex: "750", rxHex: "758", payloadHex: "31010701", noteRu: "750 RID 0701 — CM Registration alt" },
  { txHex: "750", rxHex: "758", payloadHex: "31010801", noteRu: "750 RID 0801 — Telematics/RES sibling" },
  { txHex: "750", rxHex: "758", payloadHex: "31010901", noteRu: "750 RID 0901 — CM Registration alt" },
  { txHex: "752", rxHex: "75A", payloadHex: "31010601", noteRu: "752 BIU RID 0601 (B-type / Communicating with BIU)" },
  { txHex: "752", rxHex: "75A", payloadHex: "31010701", noteRu: "752 BIU RID 0701" },
  { txHex: "752", rxHex: "75A", payloadHex: "31010801", noteRu: "752 BIU RID 0801" },
];

const RES_PROBE_TARGETS: { tx: number; rx: number; titleRu: string }[] = [
  { tx: 0x750, rx: 0x758, titleRu: "Keyless / CGW / Immobilizer (750)" },
  { tx: 0x752, rx: 0x75a, titleRu: "Body Integrated Unit BIU (752)" },
  { tx: 0x765, rx: 0x76d, titleRu: "Telematics DCM Starlink (765)" },
  { tx: 0x751, rx: 0x759, titleRu: "Кандидат RES CM (751)" },
  { tx: 0x753, rx: 0x75b, titleRu: "Кандидат RES CM (753)" },
  { tx: 0x760, rx: 0x768, titleRu: "Кандидат RES CM (760)" },
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

export interface SubaruResRegistrationResult {
  success: boolean;
  steps: string[];
  acceptedPayload: string | null;
  acceptedTx: string | null;
  securityAccessRequired: boolean;
}

function assertResPayload(payloadHex: string): void {
  const clean = payloadHex.replace(/\s+/g, "").toUpperCase();
  if ((SUBARU_RES_BLOCKED_PAYLOADS as readonly string[]).includes(clean)) {
    throw new Error("Полезная нагрузка удаления ключей / keyAdd заблокирована для RES CM Registration.");
  }
  if (!clean.startsWith("3101") && !clean.startsWith("3103") && clean !== "1003" && clean !== "1001" && clean !== "3E00") {
    if (!clean.startsWith("22") && !clean.startsWith("19")) {
      throw new Error(`Недопустимый кадр для RES CM Registration: ${clean}`);
    }
  }
}

function asciiFromPayload(bytes: number[]): string {
  return bytes
    .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ""))
    .join("")
    .trim();
}

async function openSession(elm: SubaruResLink, tx: number, rx: number): Promise<void> {
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

async function closeSession(elm: SubaruResLink): Promise<void> {
  try {
    await elm.sendPayload("1001", 1_000);
  } catch {
    /* ignore */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/** Read-only presence check: Keyless 750, BIU 752, optional RES/TLM addresses. */
export async function probeSubaruResCm(elm: SubaruResLink): Promise<SubaruResProbeResult> {
  const steps: string[] = [
    "SSM4 F2 NA/US: Remote Engine Start CM Registration — только опрос, без 2E/27/удаления ключей.",
  ];
  const modules: SubaruResProbeModule[] = [];

  try {
    await elm.sendCommand("ATST20");
  } catch {
    /* ignore */
  }

  try {
    await openSession(elm, 0x750, 0x758);
    steps.push("750→758 (CGW/Keyless): сессия 10 03");
  } catch {
    steps.push("750→758: 10 03 без ответа (шлюз может не требовать явного открытия)");
  }

  for (const target of RES_PROBE_TARGETS) {
    const txHex = target.tx.toString(16).toUpperCase();
    const rxHex = target.rx.toString(16).toUpperCase();
    let responded = false;
    let partNumber: string | null = null;
    let systemName: string | null = null;
    let noteRu = "Нет ответа";
    try {
      await elm.setCanHeader(target.tx, target.rx);
      try {
        await elm.sendPayload("3E00", 700);
      } catch {
        /* ignore */
      }
      try {
        await elm.sendPayload("1003", 1_200);
      } catch {
        /* ignore */
      }
      const raw = await elm.sendPayload("22F18E", 1_100);
      const parsed = parseUdsResponse(raw, 0x22);
      if (parsed.kind === "positive") {
        responded = true;
        partNumber = asciiFromPayload(didBody(parsed, "F18E")) || null;
        noteRu = partNumber ? `F18E ${partNumber}` : "Ответ 62 F18E";
      } else {
        const raw3e = await elm.sendPayload("3E00", 700);
        const p3e = parseUdsResponse(raw3e, 0x3e);
        if (p3e.kind === "positive") {
          responded = true;
          noteRu = "TesterPresent 7E 00 — блок на шине, F18E нет";
        } else {
          noteRu = parsed.kind === "negative" ? `NRC ${parsed.nrcText ?? ""}` : "Нет ответа";
        }
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
    keylessOk: modules.some((m) => m.txHex === "750" && m.responded),
    biuOk: modules.some((m) => m.txHex === "752" && m.responded),
  };
}

async function sendRoutineWithRetry(
  elm: SubaruResLink,
  payloadHex: string,
  steps: string[],
  label: string,
): Promise<ReturnType<typeof parseUdsResponse>> {
  assertResPayload(payloadHex);
  let last = parseUdsResponse("", 0x31);
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await elm.sendPayload("3E00", 800);
    } catch {
      /* ignore */
    }
    const raw = await elm.sendPayload(payloadHex, 8_000);
    const parsed = parseUdsResponse(raw, 0x31);
    const clean = raw.replace(/>/g, "").trim();
    steps.push(
      `${label}: попытка ${attempt} ${payloadHex} → ${clean || "нет ответа"}` +
        (parsed.kind === "negative" ? ` (${parsed.nrcText ?? "NRC"})` : ""),
    );
    last = parsed;
    if (parsed.kind === "positive") return parsed;
    if (parsed.kind === "negative" && parsed.nrc === 0x33) return parsed;
    if (
      parsed.kind === "negative" &&
      (parsed.nrc === 0x21 || parsed.nrc === 0x78 || parsed.nrc === 0x22) &&
      attempt < 5
    ) {
      await sleep(parsed.nrc === 0x78 ? 500 : 350);
      continue;
    }
    return parsed;
  }
  return last;
}

/**
 * Procedure from STIS S1108BE / H001SAN000: Immobilizer etc. → Remote Engine Start CM Registration.
 * Talks to Keyless 750 and BIU 752 only. Never deletes keys, never writeCommonArea, never invents AES.
 */
export async function registerSubaruResCm(elm: SubaruResLink): Promise<SubaruResRegistrationResult> {
  const steps: string[] = [
    "SSM4: Execute Remote Engine Start CM Registration — H-type Push Start, IG ON, один зарегистрированный ключ в салоне.",
  ];
  for (const blocked of SUBARU_RES_BLOCKED_PAYLOADS) {
    if (SUBARU_RES_REGISTRATION_CANDIDATES.some((c) => c.payloadHex === blocked)) {
      throw new Error("Кандидат записи совпал с запрещённым payload.");
    }
  }

  try {
    await elm.sendCommand("ATSTFF");
  } catch {
    /* ignore */
  }

  try {
    await openSession(elm, 0x750, 0x758);
    steps.push("750→758 (CGW/Keyless): расширенная сессия 10 03");
  } catch {
    steps.push("750→758: 10 03 не обязателен / нет ответа");
  }

  let securityAccessRequired = false;
  let acceptedPayload: string | null = null;
  let acceptedTx: string | null = null;
  let lastTx = 0x750;
  let lastRx = 0x758;

  try {
    for (const item of SUBARU_RES_REGISTRATION_CANDIDATES) {
      assertResPayload(item.payloadHex);
      const tx = Number.parseInt(item.txHex, 16);
      const rx = Number.parseInt(item.rxHex, 16);
      lastTx = tx;
      lastRx = rx;
      try {
        await openSession(elm, tx, rx);
      } catch {
        steps.push(`${item.txHex}→${item.rxHex}: не открылась сессия 10 03`);
        continue;
      }
      const parsed = await sendRoutineWithRetry(
        elm,
        item.payloadHex,
        steps,
        `${item.txHex}→${item.rxHex} ${item.noteRu}`,
      );
      if (parsed.kind === "positive") {
        acceptedPayload = item.payloadHex;
        acceptedTx = item.txHex;
        const rid = item.payloadHex.slice(4, 8);
        try {
          const poll = await elm.sendPayload(`3103${rid}`, 5_000);
          steps.push(`${item.txHex}→${item.rxHex}: опрос 31 03 ${rid} → ${poll.replace(/>/g, "").trim()}`);
        } catch {
          /* some ECUs finish on 71 01 without 31 03 */
        }
        steps.push(`${item.txHex}→${item.rxHex}: блок подтвердил регистрацию RES CM (71).`);
        break;
      }
      if (parsed.kind === "negative" && parsed.nrc === 0x33) {
        securityAccessRequired = true;
        steps.push(
          `${item.txHex}→${item.rxHex}: NRC 33 SecurityAccess. AES-ключ SGP в QHub не подставляется — введите дилерский 27 02, затем повторите RES CM.`,
        );
        break;
      }
    }
  } finally {
    try {
      await elm.setCanHeader(lastTx, lastRx);
      await closeSession(elm);
      steps.push(`${lastTx.toString(16).toUpperCase()}→${lastRx.toString(16).toUpperCase()}: сессия 10 01`);
    } catch {
      /* ignore */
    }
  }

  if (!acceptedPayload && !securityAccessRequired) {
    steps.push(
      "Ни один RID 0601–0901 на 750/752 не дал 71. Проверьте: IG ON, рабочий смарт-ключ в салоне, RES физически на CAN, дверь водителя открыта (чтобы BIU не уснул).",
    );
  } else if (acceptedPayload) {
    steps.push("Remote Engine Start CM Registration ended. Выключите зажигание (IG OFF), как в SSM4.");
  }

  return {
    success: acceptedPayload != null,
    steps,
    acceptedPayload,
    acceptedTx,
    securityAccessRequired,
  };
}
