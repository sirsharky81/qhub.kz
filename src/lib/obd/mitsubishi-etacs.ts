import { bytesToHex, extractHexTokens, stripElmMultiline } from "./hex";
import type { Elm327Client } from "./elm327";

export type MitsubishiCodingModuleKind = "etacs" | "engine";

export interface EtacsCanProfile {
  id: string;
  label: string;
  moduleKind?: MitsubishiCodingModuleKind;
  txId: number;
  rxId: number;
  /** Primary service: 0x21 (KWP ReadDataByLocalIdentifier) or 0x22 (UDS ReadDataByIdentifier). */
  service: 0x21 | 0x22;
  /** Identifier for variant coding (MMCodingWriter / MUT .kon). */
  variantId: number[];
  /** Identifier for custom coding (.cuf), optional for Engine ECU. */
  customId: number[];
  /** Optional identifier for ECU part/SW number. */
  partId?: number[];
}

/** Common Mitsubishi ETACS & Engine ECU addressing (11-bit 500k CAN). */
export const ETACS_PROFILES: EtacsCanProfile[] = [
  {
    id: "auto",
    label: "Автопоиск ETACS (620→504 / 7A1→7A0 / 710→718, 8637C671 / 8637B838)",
    moduleKind: "etacs",
    txId: 0x620,
    rxId: 0x504,
    service: 0x21,
    variantId: [0x30],
    customId: [0x31],
    partId: [0x80],
  },
  {
    id: "620-504",
    label: "ETACS 620 → 504 · KWP 21 (8637C671 Pajero Sport III / L200 V / Outlander III)",
    moduleKind: "etacs",
    txId: 0x620,
    rxId: 0x504,
    service: 0x21,
    variantId: [0x30],
    customId: [0x31],
    partId: [0x80],
  },
  {
    id: "7a1-7a0",
    label: "ETACS 7A1 → 7A0 · KWP 21 (8637B838 Outlander XL/III, ASX, Lancer X)",
    moduleKind: "etacs",
    txId: 0x7a1,
    rxId: 0x7a0,
    service: 0x21,
    variantId: [0x30],
    customId: [0x31],
    partId: [0x80],
  },
  {
    id: "710-718",
    label: "ETACS 710 → 718 · KWP 21 (альтернативный адрес)",
    moduleKind: "etacs",
    txId: 0x710,
    rxId: 0x718,
    service: 0x21,
    variantId: [0x30],
    customId: [0x31],
    partId: [0x80],
  },
  {
    id: "7a1-7a0-uds",
    label: "ETACS 7A1 → 7A0 · UDS 22 (новые кузова 22 B0/B1)",
    moduleKind: "etacs",
    txId: 0x7a1,
    rxId: 0x7a0,
    service: 0x22,
    variantId: [0x01, 0x30],
    customId: [0x01, 0x31],
    partId: [0xf1, 0x87],
  },
  {
    id: "engine-auto",
    label: "Двигатель (ECM 7E0 → 7E8) · Автопоиск .kon (1860D362 / KWP 21 и UDS 22)",
    moduleKind: "engine",
    txId: 0x7e0,
    rxId: 0x7e8,
    service: 0x21,
    variantId: [0x30],
    customId: [0x31],
    partId: [0x80],
  },
  {
    id: "engine-7e0-kwp",
    label: "Двигатель (ECM 7E0 → 7E8) · KWP 21 (1860D362 Pajero Sport V6 бензин / Outlander / L200)",
    moduleKind: "engine",
    txId: 0x7e0,
    rxId: 0x7e8,
    service: 0x21,
    variantId: [0x30],
    customId: [0x31],
    partId: [0x80],
  },
  {
    id: "engine-7e0-uds",
    label: "Двигатель (ECM 7E0 → 7E8) · UDS 22 (новые ЭБУ ДВС Mitsubishi)",
    moduleKind: "engine",
    txId: 0x7e0,
    rxId: 0x7e8,
    service: 0x22,
    variantId: [0x01, 0x30],
    customId: [0x01, 0x31],
    partId: [0xf1, 0x87],
  },
];

export interface EtacsExtraLidItem {
  lidHex: string;
  label: string;
  payload: Uint8Array;
  ascii: string | null;
}

export interface EtacsCodingDump {
  profileId: string;
  profileLabel: string;
  moduleKind?: MitsubishiCodingModuleKind;
  txHex: string;
  rxHex: string;
  partNumber: string | null;
  swVersion?: string | null;
  vin?: string | null;
  variant: Uint8Array;
  custom: Uint8Array;
  rawVariantResponse: string;
  rawCustomResponse: string;
  variantUsedId?: string;
  customUsedId?: string;
  customStatusNote?: string | null;
  extraLids?: EtacsExtraLidItem[];
}

/**
 * Extract binary payload after positive SID (`61 LID` or `62 DID_HI DID_LO`).
 * Uses ELM's declared ISO-TP byte count when available so trailing CAN padding
 * bytes (`00` or `AA` on the last frame) do not corrupt the `.kon` / `.cuf` size.
 */
export function positiveEtacsPayload(
  raw: string,
  service: number,
  identifier: number[],
): Uint8Array | null {
  const { declaredLength } = stripElmMultiline(raw);
  const bytes = extractHexTokens(raw);
  const expectSid = (service + 0x40) & 0xff;
  const idLen = identifier.length;

  for (let i = 0; i + idLen < bytes.length; i++) {
    if (bytes[i] !== expectSid) continue;
    let matches = true;
    for (let k = 0; k < idLen; k++) {
      if (bytes[i + 1 + k] !== identifier[k]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    const headerBytes = 1 + idLen;
    let data = bytes.slice(i + headerBytes);
    if (declaredLength != null && declaredLength > headerBytes) {
      const expectedPayloadLen = declaredLength - headerBytes;
      if (expectedPayloadLen > 0 && expectedPayloadLen <= data.length) {
        data = data.slice(0, expectedPayloadLen);
      }
    }
    if (data.length > 0) return Uint8Array.from(data);
  }
  return null;
}

async function configureEtacsChannel(elm: Elm327Client, profile: EtacsCanProfile): Promise<void> {
  const txHex = profile.txId.toString(16).padStart(3, "0").toUpperCase();
  const rxHex = profile.rxId.toString(16).padStart(3, "0").toUpperCase();
  const standardPair = profile.rxId === ((profile.txId + 8) & 0x7ff);

  if (standardPair) {
    await elm.clearRxFilter();
    await elm.setCanHeader(profile.txId);
  } else {
    // Non-standard CAN pair (e.g. 620 -> 504 or 7A1 -> 7A0):
    // Program explicit ISO-TP Flow Control header (ATFCSH) + data (ATFCSD 300000) + mode (ATFCSM1)
    // so multi-frame responses on 504/7A0 receive Flow Control on 620/7A1.
    await elm.setCanHeader(profile.txId, profile.rxId);
    try {
      await elm.sendCommand(`ATFCSH${txHex}`);
      await elm.sendCommand("ATFCSD300000");
      await elm.sendCommand("ATFCSM1");
    } catch {
      /* some ELM clones ignore explicit FC commands */
    }
  }

  // Open KWP / UDS diagnostic session.
  // IMPORTANT: On KWP2000 ETACS (620->504, 7A1->7A0), sending UDS "10 03" AFTER "10 92"
  // either resets the session or returns 7F 10 12, locking Custom Coding (21 31 -> 7F 21 12).
  if (profile.service === 0x21) {
    let opened = false;
    for (const sessionCmd of ["1092", "1085", "1089", "1081"]) {
      try {
        const resp = await elm.sendPayload(sessionCmd, 2_500);
        const tokens = extractHexTokens(resp);
        if (tokens.includes(0x50)) {
          opened = true;
          break;
        }
      } catch {
        /* try next KWP session mode */
      }
    }
    if (!opened) {
      try {
        await elm.sendPayload("1003", 2_500);
      } catch {
        /* default session fallback */
      }
    }
    try {
      await elm.sendPayload("3E", 2_000);
    } catch {
      /* optional KWP TesterPresent */
    }
  } else {
    try {
      await elm.sendPayload("1003", 3_000);
      await elm.sendPayload("3E00", 2_500);
    } catch {
      /* optional UDS extended session */
    }
  }
}

async function readCodingBlockWithFallbacks(
  elm: Elm327Client,
  profile: EtacsCanProfile,
  candidates: number[][],
): Promise<{ payload: Uint8Array; raw: string; usedIdHex: string }> {
  const svcHex = profile.service.toString(16).padStart(2, "0").toUpperCase();
  let lastCompact = "NO DATA";
  let firstIdHex = "";

  for (const identifier of candidates) {
    const idHex = identifier.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
    if (!firstIdHex) firstIdHex = idHex;
    const raw = await elm.sendPayload(`${svcHex}${idHex}`, 12_000);
    const payload = positiveEtacsPayload(raw, profile.service, identifier);
    if (payload && payload.length > 0) {
      return { payload, raw, usedIdHex: `${svcHex} ${idHex}` };
    }
    lastCompact = raw.replace(/>/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "NO DATA";
  }

  throw new Error(
    `ETACS не отдал блок ${svcHex} ${firstIdHex} (${lastCompact}) на адресе ${profile.txId.toString(16).toUpperCase()}/${profile.rxId.toString(16).toUpperCase()}.`,
  );
}

function extractCleanAscii(payload: Uint8Array): string | null {
  const ascii = Array.from(payload)
    .filter((b) => b >= 0x20 && b <= 0x7e)
    .map((b) => String.fromCharCode(b))
    .join("")
    .trim();
  return ascii.length >= 4 ? ascii : null;
}

async function tryReadPartNumber(elm: Elm327Client, profile: EtacsCanProfile): Promise<string | null> {
  const partCandidates =
    profile.service === 0x21
      ? [profile.partId ?? [0x80], [0x87], [0x90], [0x99], [0x81]]
      : [profile.partId ?? [0xf1, 0x87], [0xf1, 0x91], [0xf1, 0x90]];

  for (const partId of partCandidates) {
    try {
      const idHex = partId.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
      const svcHex = profile.service.toString(16).padStart(2, "0").toUpperCase();
      const raw = await elm.sendPayload(`${svcHex}${idHex}`, 3_500);
      const payload = positiveEtacsPayload(raw, profile.service, partId);
      if (!payload || payload.length < 4) continue;
      // Prefer Mitsubishi OEM part number pattern (ETACS 8637xxxx or Engine ECU 1860xxxx) when embedded in a larger ECU ID block
      const ascii = extractCleanAscii(payload);
      if (ascii) {
        const mitsuMatch = ascii.match(/\b(?:8637|1860)[A-Z0-9]{4}\b/i);
        if (mitsuMatch?.[0]) return mitsuMatch[0].toUpperCase();
        return ascii;
      }
    } catch {
      /* try next part LID */
    }
  }
  return null;
}

async function probeExtraEtacsLids(
  elm: Elm327Client,
  profile: EtacsCanProfile,
  skipIdHex: Set<string>,
): Promise<{ extraLids: EtacsExtraLidItem[]; swVersion: string | null; vin: string | null }> {
  const extraLids: EtacsExtraLidItem[] = [];
  let swVersion: string | null = null;
  let vin: string | null = null;

  if (profile.service !== 0x21) {
    return { extraLids, swVersion, vin };
  }

  const probes: { lid: number; label: string }[] = [
    { lid: 0x31, label: "Custom Coding 1 (21 31)" },
    { lid: 0x32, label: "Custom Coding 2 / Sub-block (21 32)" },
    { lid: 0x33, label: "Custom Coding 3 (21 33)" },
    { lid: 0x40, label: "Кодировка опций 40 (21 40)" },
    { lid: 0x41, label: "Кодировка опций 41 (21 41)" },
    { lid: 0x42, label: "Variant / Option Block 42 (21 42)" },
    { lid: 0x43, label: "Custom / Option Block 43 (21 43)" },
    { lid: 0x50, label: "Конфигурация 50 (21 50)" },
    { lid: 0x51, label: "Пользовательские настройки 51 (21 51)" },
    { lid: 0x52, label: "Пользовательские настройки 52 (21 52)" },
    { lid: 0x80, label: "Идентификатор ЭБУ / Part Number (21 80)" },
    { lid: 0x81, label: "Версия ПО / HW (21 81)" },
    { lid: 0x87, label: "Каталожный номер OEM (21 87)" },
    { lid: 0x90, label: "VIN в блоке ETACS (21 90)" },
    { lid: 0x99, label: "Серийный / калибровочный номер (21 99)" },
  ];

  for (const probe of probes) {
    const hexCode = `21 ${probe.lid.toString(16).padStart(2, "0").toUpperCase()}`;
    if (skipIdHex.has(hexCode)) continue;
    try {
      const cmd = `21${probe.lid.toString(16).padStart(2, "0").toUpperCase()}`;
      const raw = await elm.sendPayload(cmd, 2_500);
      const payload = positiveEtacsPayload(raw, 0x21, [probe.lid]);
      if (!payload || payload.length === 0) continue;
      const ascii = extractCleanAscii(payload);
      if (probe.lid === 0x81 && ascii && !swVersion) swVersion = ascii;
      if (probe.lid === 0x90 && ascii && !vin) vin = ascii;
      extraLids.push({
        lidHex: hexCode,
        label: probe.label,
        payload,
        ascii,
      });
    } catch {
      /* ignore unsupported LID */
    }
  }

  return { extraLids, swVersion, vin };
}

async function readSingleEtacsProfile(
  elm: Elm327Client,
  profile: EtacsCanProfile,
): Promise<EtacsCodingDump> {
  await configureEtacsChannel(elm, profile);
  const isEngine = profile.moduleKind === "engine" || profile.txId === 0x7e0;

  const variantCandidates =
    profile.service === 0x21
      ? isEngine
        ? [profile.variantId, [0x32], [0x50], [0x51], [0x52], [0x42], [0x40], [0x31], [0xb0]]
        : [profile.variantId, [0x42], [0x50], [0xb0]]
      : [profile.variantId, [0x01, 0x32], [0x01, 0x42], [0x01, 0x50], [0xb0, 0x01]];

  const customCandidates =
    profile.service === 0x21
      ? [profile.customId, [0x32], [0x43], [0x51], [0x40], [0x52], [0xb1]]
      : [profile.customId, [0x01, 0x32], [0x01, 0x43], [0xb1, 0x01]];

  const variant = await readCodingBlockWithFallbacks(elm, profile, variantCandidates);

  // Engine ECUs (1860xxxx on 7E0->7E8) typically only have a single Variant Coding block (.kon)
  // without a separate Custom Coding (.cuf). Some ETACS units (especially 620->504) also return
  // 7F 21 12 for 21 31. Never discard a valid .kon dump when .cuf is absent!
  let customPayload: Uint8Array = new Uint8Array(0);
  let customRaw = "";
  let customUsedId: string | undefined;
  let customStatusNote: string | null = null;

  try {
    const filteredCustom = customCandidates.filter(
      (cand) => `21 ${cand.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("")}` !== variant.usedIdHex,
    );
    const custom = await readCodingBlockWithFallbacks(elm, profile, filteredCustom);
    customPayload = custom.payload;
    customRaw = custom.raw;
    customUsedId = custom.usedIdHex;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    customRaw = msg;
    customStatusNote = isEngine
      ? "Кодировка ЭБУ двигателя (.kon) успешно считана. Для блока двигателя используется один файл Variant (.kon) и резервная копия (.json)."
      : "Блок ETACS отдал основную кодировку Variant (.kon), но не поддерживает отдельный блок Custom (.cuf — ответ 7F 21 12). Вы можете сразу скачать .kon и .json.";
  }

  const partNumber = await tryReadPartNumber(elm, profile);
  const skipSet = new Set<string>();
  if (variant.usedIdHex) skipSet.add(variant.usedIdHex);
  if (customUsedId) skipSet.add(customUsedId);
  const { extraLids, swVersion, vin } = await probeExtraEtacsLids(elm, profile, skipSet);

  // Reset Flow Control mode to automatic (ATFCSM0) so subsequent standard UDS requests work normally
  try {
    await elm.sendCommand("ATFCSM0");
  } catch {
    /* ignore */
  }

  return {
    profileId: profile.id,
    profileLabel: profile.label,
    moduleKind: isEngine ? "engine" : "etacs",
    txHex: profile.txId.toString(16).toUpperCase(),
    rxHex: profile.rxId.toString(16).toUpperCase(),
    partNumber,
    swVersion,
    vin,
    variant: variant.payload,
    custom: customPayload,
    rawVariantResponse: variant.raw,
    rawCustomResponse: customRaw,
    variantUsedId: variant.usedIdHex,
    customUsedId,
    customStatusNote,
    extraLids,
  };
}

export async function readEtacsCoding(
  elm: Elm327Client,
  profile: EtacsCanProfile = ETACS_PROFILES[0]!,
): Promise<EtacsCodingDump> {
  const candidates =
    profile.id === "auto"
      ? ETACS_PROFILES.filter((item) => item.id !== "auto" && item.moduleKind !== "engine")
      : profile.id === "engine-auto"
        ? ETACS_PROFILES.filter((item) => item.id !== "engine-auto" && item.moduleKind === "engine")
        : [profile];

  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      return await readSingleEtacsProfile(elm, candidate);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(
    `Не удалось выгрузить кодировку Mitsubishi. Включите зажигание (ON) и проверьте подключение. Ответы: ${errors.join(" | ")}`,
  );
}

/** MMCodingWriter / MUT Coding filenames (binary payload from ECU). */
export function etacsDownloadNames(prefix: string): { kon: string; cuf: string; json: string } {
  const safe = prefix.replace(/[^\w\-]+/g, "_").slice(0, 40);
  return {
    kon: `${safe}_variant.kon`,
    cuf: `${safe}_custom.cuf`,
    json: `${safe}_etacs_backup.json`,
  };
}

export interface EtacsWriteBlockResult {
  kind: "kon" | "cuf";
  profileId: string;
  txHex: string;
  rxHex: string;
  writeCommandHex: string;
  writtenBytes: number;
  verified: boolean;
  rawWriteResponse: string;
  note: string;
}

/**
 * Parse a user-supplied `.kon` / `.cuf` / `.json` file into raw coding bytes.
 * Supports:
 * - Raw binary `.kon` / `.cuf` files (exact byte array from MMCodingWriter / MUT Coding / QHub)
 * - `.json` backup files exported by QHub (`variantHex` / `customHex`)
 * - Plain text / ASCII hex files (e.g. `A1 B2 C3...` or `61 30 A1 B2...`)
 */
export function parseMitsubishiCodingFileBytes(
  fileBuffer: Uint8Array,
  kind: "kon" | "cuf",
  fileName = "",
): { payload: Uint8Array; detectedPartNumber?: string | null; detectedLidHex?: string | null } {
  if (fileBuffer.length === 0) {
    throw new Error("Выбранный файл пуст (0 байт).");
  }

  const lowerName = fileName.toLowerCase();
  const isPrintableText = Array.from(fileBuffer).every(
    (b) => b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e),
  );

  if (lowerName.endsWith(".json") || (isPrintableText && fileBuffer[0] === 0x7b)) {
    const text = new TextDecoder().decode(fileBuffer);
    const parsed = JSON.parse(text) as {
      partNumber?: string | null;
      variantHex?: string;
      customHex?: string;
      variantUsedId?: string | null;
      customUsedId?: string | null;
    };
    const hexStr = kind === "kon" ? parsed.variantHex : parsed.customHex;
    if (!hexStr || typeof hexStr !== "string" || hexStr.trim().length < 2) {
      throw new Error(
        kind === "kon"
          ? "В JSON-файле не найден массив variantHex (.kon)."
          : "В JSON-файле не найден массив customHex (.cuf).",
      );
    }
    const clean = hexStr.replace(/[^0-9A-Fa-f]/g, "");
    const out = new Uint8Array(Math.floor(clean.length / 2));
    for (let i = 0; i < out.length; i++) {
      out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return {
      payload: out,
      detectedPartNumber: parsed.partNumber ?? null,
      detectedLidHex: (kind === "kon" ? parsed.variantUsedId : parsed.customUsedId) ?? null,
    };
  }

  // Check if the file is an ASCII hex dump or MMCodingWriter text container with header + hex
  if (isPrintableText && fileBuffer.length >= 8) {
    const text = new TextDecoder().decode(fileBuffer).trim();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const hexOnlyLines = lines.filter((l) => /^[0-9A-Fa-f\s:;-]+$/.test(l) && /[0-9A-Fa-f]{4}/.test(l));
    if (hexOnlyLines.length > 0 && hexOnlyLines.length === lines.length) {
      const tokens = extractHexTokens(text);
      if (tokens.length >= 4) {
        // Strip leading positive response header if someone pasted "61 30 ..." or "61 31 ..."
        const stripped =
          tokens[0] === 0x61 && (tokens[1] === 0x30 || tokens[1] === 0x31 || tokens[1] === 0x32)
            ? tokens.slice(2)
            : tokens;
        return { payload: Uint8Array.from(stripped) };
      }
    }
  }

  return { payload: new Uint8Array(fileBuffer) };
}

function parseLidBytesFromReadId(
  usedIdHex: string | undefined,
  fallbackId: number[],
): number[] {
  if (!usedIdHex) return fallbackId;
  const parts = usedIdHex
    .trim()
    .split(/\s+/)
    .map((p) => Number.parseInt(p, 16))
    .filter((n) => Number.isFinite(n));
  if (parts.length >= 2 && (parts[0] === 0x21 || parts[0] === 0x22 || parts[0] === 0x3b || parts[0] === 0x2e)) {
    return parts.slice(1);
  }
  if (parts.length >= 1 && parts.every((n) => n >= 0 && n <= 0xff)) {
    return parts;
  }
  return fallbackId;
}

/**
 * Write a single coding block (either `.kon` Variant OR `.cuf` Custom) to Mitsubishi ETACS or Engine ECU.
 *
 * Why `.kon` and `.cuf` MUST be written separately and sequentially:
 * - Writing `.kon` (Variant Coding, `3B 30` / `2E 0130`) causes the ETACS ECU to re-initialize
 *   its feature matrix and reset Custom Coding (`.cuf`, `LID 31`) back to factory defaults.
 * - Therefore, the user must first write `.kon` (Step 1), let the ECU commit Variant Coding,
 *   and then separately write the saved `.cuf` file (Step 2) to restore all custom settings.
 */
export async function writeEtacsSingleBlock(
  elm: Elm327Client,
  options: {
    profile: EtacsCanProfile;
    kind: "kon" | "cuf";
    payload: Uint8Array;
    overrideLidHex?: string;
  },
): Promise<EtacsWriteBlockResult> {
  const { profile, kind, payload, overrideLidHex } = options;
  if (!payload || payload.length < 2) {
    throw new Error("Массив кодировки слишком короткий (минимум 2 байта).");
  }
  if (payload.length > 250) {
    throw new Error(`Слишком большой размер блока кодировки (${payload.length} байт, максимум 250 байт).`);
  }

  // If "auto" or "engine-auto" was selected, resolve the concrete profile by probing read first
  let activeProfile = profile;
  let detectedReadId: string | undefined;
  if (profile.id === "auto" || profile.id === "engine-auto") {
    const currentDump = await readEtacsCoding(elm, profile);
    const resolved = ETACS_PROFILES.find((p) => p.id === currentDump.profileId);
    if (resolved) activeProfile = resolved;
    detectedReadId = kind === "kon" ? currentDump.variantUsedId : currentDump.customUsedId;
  }

  await configureEtacsChannel(elm, activeProfile);

  const defaultId = kind === "kon" ? activeProfile.variantId : activeProfile.customId;
  const targetId = parseLidBytesFromReadId(overrideLidHex ?? detectedReadId, defaultId);
  const idHex = targetId.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
  const writeSvc = activeProfile.service === 0x21 ? 0x3b : 0x2e;
  const expectPosSid = (writeSvc + 0x40) & 0xff; // 0x7B for KWP 3B, 0x6E for UDS 2E
  const writeSvcHex = writeSvc.toString(16).padStart(2, "0").toUpperCase();
  const dataHex = bytesToHex(payload, "");

  // Ensure coding write session is unlocked (KWP 10 92 / 10 85 or UDS 10 03)
  const rawWriteResponse = await elm.sendPayload(`${writeSvcHex}${idHex}${dataHex}`, 15_000);
  const tokens = extractHexTokens(rawWriteResponse);

  const isPositive = tokens.some((b, idx) => {
    if (b !== expectPosSid) return false;
    if (idx + targetId.length >= tokens.length) return true;
    return targetId.every((idByte, k) => tokens[idx + 1 + k] === idByte);
  });

  if (!isPositive) {
    // Check for negative response 7F <svc> <nrc>
    let nrcDetail = rawWriteResponse.replace(/>/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "NO DATA";
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (tokens[i] === 0x7f && tokens[i + 1] === writeSvc) {
        const nrc = tokens[i + 2]!.toString(16).padStart(2, "0").toUpperCase();
        nrcDetail = `7F ${writeSvcHex} ${nrc}`;
        break;
      }
    }
    try {
      await elm.sendCommand("ATFCSM0");
    } catch {
      /* ignore */
    }
    throw new Error(
      `Блок ${activeProfile.txId.toString(16).toUpperCase()}/${activeProfile.rxId.toString(16).toUpperCase()} отклонил запись ${writeSvcHex} ${idHex} (${nrcDetail}). Проверьте, что зажигание в положении ON (двигатель заглушен), а размер файла (${payload.length} Б) точно соответствует этому блоку.`,
    );
  }

  // Read back the same LID/DID to verify bytes were committed to EEPROM
  let verified = false;
  try {
    const readSvcHex = activeProfile.service.toString(16).padStart(2, "0").toUpperCase();
    const verifyRaw = await elm.sendPayload(`${readSvcHex}${idHex}`, 10_000);
    const verifyPayload = positiveEtacsPayload(verifyRaw, activeProfile.service, targetId);
    if (verifyPayload && verifyPayload.length === payload.length) {
      verified = verifyPayload.every((b, idx) => b === payload[idx]);
    }
  } catch {
    /* verification read is best-effort */
  }

  try {
    await elm.sendCommand("ATFCSM0");
  } catch {
    /* ignore */
  }

  const note =
    kind === "kon"
      ? verified
        ? `Variant (.kon, ${payload.length} Б) успешно записан и проверен по чтению! Внимание: при записи .kon блок ETACS сбрасывает настройки .cuf на базовые — теперь обязательно запишите ваш файл .cuf вторым шагом.`
        : `Variant (.kon, ${payload.length} Б) принят блоком (ответ ${expectPosSid.toString(16).toUpperCase()} ${idHex}). Внимание: после записи .kon настройки .cuf сбрасываются на базовые — запишите ваш файл .cuf отдельно вторым шагом.`
      : verified
        ? `Custom (.cuf, ${payload.length} Б) успешно записан и проверен по чтению! Пользовательские настройки восстановлены.`
        : `Custom (.cuf, ${payload.length} Б) принят блоком (ответ ${expectPosSid.toString(16).toUpperCase()} ${idHex}). Выключите зажигание на 5–10 секунд для фиксации в памяти.`;

  return {
    kind,
    profileId: activeProfile.id,
    txHex: activeProfile.txId.toString(16).toUpperCase(),
    rxHex: activeProfile.rxId.toString(16).toUpperCase(),
    writeCommandHex: `${writeSvcHex} ${idHex}`,
    writtenBytes: payload.length,
    verified,
    rawWriteResponse,
    note,
  };
}

