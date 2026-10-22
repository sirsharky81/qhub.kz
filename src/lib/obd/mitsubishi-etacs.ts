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
    // Strip Mitsubishi KWP 4-byte coding block footer ("A0 xx A0 yy", e.g. "A0 05 A0 01" or "A0 01 A0 16")
    if (
      service === 0x21 &&
      data.length >= 5 &&
      data[data.length - 4] === 0xa0 &&
      data[data.length - 2] === 0xa0
    ) {
      data = data.slice(0, data.length - 4);
    }
    if (data.length > 0) return Uint8Array.from(data);
  }
  return null;
}

async function configureEtacsChannel(elm: Elm327Client, profile: EtacsCanProfile): Promise<void> {
  const txHex = profile.txId.toString(16).padStart(3, "0").toUpperCase();
  const standardPair = profile.rxId === ((profile.txId + 8) & 0x7ff);

  // Enable spaces (ATS1) so ELM multiline frames ("04A\r0: 61 30 ..." or "10 4A 61 30...")
  // are cleanly separated and never merge the 3-nibble ISO-TP byte length with the first payload bytes!
  try {
    await elm.sendCommand("ATS1");
    await elm.sendCommand("ATAL");
  } catch {
    /* ignore */
  }

  if (standardPair) {
    await elm.clearRxFilter();
    await elm.setCanHeader(profile.txId);
    try {
      await elm.sendCommand("ATFCSM0");
    } catch {
      /* ignore */
    }
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
  // IMPORTANT:
  // 1. On KWP2000 ETACS (620->504, 7A1->7A0) and Engine ECU (7E0->7E8),
  //    sending UDS "10 03" AFTER KWP "10 92" / "10 89" resets the session.
  // 2. NEVER send KWP "10 85" (ECUProgrammingSession / ROM flash mode) when reading coding:
  //    on Mitsubishi Engine ECUs (7E0->7E8), "10 92" returns 7F 10 12 and "10 85" succeeds (50 85),
  //    trapping the Engine ECU in Programming Session where all 21 xx coding LIDs fail with 7F 21 12!
  const isEngine = profile.moduleKind === "engine" || profile.txId === 0x7e0;
  if (profile.service === 0x21) {
    const kwpSessions = isEngine
      ? ["1089", "1081", "1092", "10C0", "1090"]
      : ["1092", "1089", "1081", "10C0", "1090"];
    let opened = false;
    for (const sessionCmd of kwpSessions) {
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
  options?: { minBytes?: number; fallbackSessions?: string[] },
): Promise<{ payload: Uint8Array; raw: string; usedIdHex: string; shortFallback?: { payload: Uint8Array; raw: string; usedIdHex: string } | null }> {
  const svcHex = profile.service.toString(16).padStart(2, "0").toUpperCase();
  const minBytes = options?.minBytes ?? 1;
  let lastCompact = "NO DATA";
  const triedIds: string[] = [];
  let bestShortFallback: { payload: Uint8Array; raw: string; usedIdHex: string } | null = null;

  const probeCandidateList = async (list: number[][]): Promise<{ payload: Uint8Array; raw: string; usedIdHex: string } | null> => {
    for (const identifier of list) {
      const idHex = identifier.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
      if (!triedIds.includes(idHex)) triedIds.push(idHex);
      const raw = await elm.sendPayload(`${svcHex}${idHex}`, 12_000);
      const payload = positiveEtacsPayload(raw, profile.service, identifier);
      if (payload && payload.length >= minBytes) {
        return { payload, raw, usedIdHex: `${svcHex} ${idHex}` };
      }
      if (payload && payload.length > 0 && (!bestShortFallback || payload.length > bestShortFallback.payload.length)) {
        bestShortFallback = { payload, raw, usedIdHex: `${svcHex} ${idHex}` };
      }
      lastCompact = raw.replace(/>/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "NO DATA";
    }
    return null;
  };

  const directHit = await probeCandidateList(candidates);
  if (directHit) {
    return { ...directHit, shortFallback: bestShortFallback };
  }

  // If primary session returned 7F 21 12 or only a short status, try fallback KWP sessions (e.g. 10 81 / 10 92 / 10 89)
  if (profile.service === 0x21 && options?.fallbackSessions && options.fallbackSessions.length > 0) {
    const topCandidates = candidates.slice(0, 24);
    for (const sessCmd of options.fallbackSessions) {
      try {
        const sessResp = await elm.sendPayload(sessCmd, 2_500);
        if (!extractHexTokens(sessResp).includes(0x50)) continue;
        const retryHit = await probeCandidateList(topCandidates);
        if (retryHit) {
          return { ...retryHit, shortFallback: bestShortFallback };
        }
      } catch {
        /* try next fallback session */
      }
    }
  }

  if (bestShortFallback) {
    return bestShortFallback;
  }

  const summaryIds = triedIds.slice(0, 6).join("/");
  throw new Error(
    `ETACS не отдал блок ${svcHex} ${summaryIds || "30"} (${lastCompact}) на адресе ${profile.txId.toString(16).toUpperCase()}/${profile.rxId.toString(16).toUpperCase()}.`,
  );
}

function extractCleanAscii(payload: Uint8Array): string | null {
  // Split on non-printable bytes so binary headers in KWP 1A 87 / 1A 9C ("04 82 00 17 FF 20 00 3D 00 00 38 36...")
  // do not glue stray single printable bytes (like 0x3D "=") onto the ASCII Part Number or VIN.
  const runs: string[] = [];
  let current = "";
  for (const b of payload) {
    if (b >= 0x20 && b <= 0x7e) {
      current += String.fromCharCode(b);
    } else if (current.length > 0) {
      const trimmed = current.trim();
      if (trimmed.length >= 4) runs.push(trimmed);
      current = "";
    }
  }
  if (current.length > 0) {
    const trimmed = current.trim();
    if (trimmed.length >= 4) runs.push(trimmed);
  }
  if (runs.length > 0) {
    return runs.join(" ");
  }

  const ascii = Array.from(payload)
    .filter((b) => b >= 0x20 && b <= 0x7e)
    .map((b) => String.fromCharCode(b))
    .join("")
    .trim();
  return ascii.length >= 4 ? ascii : null;
}

function extractVinFromAscii(ascii: string | null): string | null {
  if (!ascii) return null;
  const match = ascii.toUpperCase().match(/[A-HJ-NPR-Z0-9]{17}/);
  return match?.[0] ?? null;
}

function extractPartNumberFromAscii(ascii: string | null): string | null {
  if (!ascii) return null;
  const mitsuMatch = ascii.match(/(?:8637|1860|8100|8631)[A-Z0-9]{4,6}(?:-[A-Z0-9])?/i);
  if (mitsuMatch?.[0]) return mitsuMatch[0].toUpperCase();
  return null;
}

function extractPartNumberFromBytes(payload: Uint8Array): string | null {
  const fullAscii = Array.from(payload)
    .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : " "))
    .join("");
  return extractPartNumberFromAscii(fullAscii);
}

function extractVinFromBytes(payload: Uint8Array): string | null {
  const fullAscii = Array.from(payload)
    .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : " "))
    .join("");
  return extractVinFromAscii(fullAscii);
}

async function tryReadPartNumber(
  elm: Elm327Client,
  profile: EtacsCanProfile,
): Promise<{
  partNumber: string | null;
  swVersion: string | null;
  detectedVin: string | null;
  idLids: EtacsExtraLidItem[];
}> {
  let partNumber: string | null = null;
  let swVersion: string | null = null;
  let detectedVin: string | null = null;
  const idLids: EtacsExtraLidItem[] = [];

  // On Mitsubishi KWP2000 CAN ECUs (ETACS 620->504, Engine 7E0->7E8, Meter 6A0->514),
  // MMCodingWriter / MUT-III reads ECU Identification via Service 0x1A (ReadEcuIdentification, positive 0x5A):
  // - 1A 87 -> 5A 87 ... (Hardware Part Number, e.g. 8637C671 / 1860D362)
  // - 1A 9C -> 5A 9C ... (Software Part Number, e.g. 8637C671-A)
  // - 1A 90 -> 5A 90 ... (Current VIN in ECU, 17 ASCII chars)
  // - 1A 88 -> 5A 88 ... (Original VIN in ECU, 17 ASCII chars)
  if (profile.service === 0x21) {
    const kwp1aProbes: { id: number; label: string; role: "pn" | "sw" | "vin" | "orig_vin" }[] = [
      { id: 0x87, label: "Паспорт ЭБУ / Part Number (1A 87)", role: "pn" },
      { id: 0x9c, label: "Версия ПО ЭБУ / SW PN (1A 9C)", role: "sw" },
      { id: 0x90, label: "Текущий VIN в блоке (1A 90)", role: "vin" },
      { id: 0x88, label: "Оригинальный VIN в блоке (1A 88)", role: "orig_vin" },
    ];

    for (const probe of kwp1aProbes) {
      try {
        const idHex = probe.id.toString(16).padStart(2, "0").toUpperCase();
        const raw = await elm.sendPayload(`1A${idHex}`, 3_000);
        const payload = positiveEtacsPayload(raw, 0x1a, [probe.id]);
        if (!payload || payload.length < 4) continue;
        const ascii = extractCleanAscii(payload);
        const pnHit = extractPartNumberFromBytes(payload) ?? extractPartNumberFromAscii(ascii);
        const vinHit = extractVinFromBytes(payload) ?? extractVinFromAscii(ascii);
        idLids.push({
          lidHex: `1A ${idHex}`,
          label: probe.label,
          payload,
          ascii: pnHit ?? vinHit ?? ascii,
        });
        if (probe.role === "pn" && !partNumber && (pnHit ?? ascii)) {
          partNumber = (pnHit ?? ascii!).replace(/-[A-Z0-9]$/i, "");
        } else if (probe.role === "sw" && !swVersion && (pnHit ?? ascii)) {
          swVersion = pnHit ?? ascii;
          if (!partNumber && pnHit) {
            partNumber = pnHit.replace(/-[A-Z0-9]$/i, "");
          }
        } else if ((probe.role === "vin" || probe.role === "orig_vin") && vinHit && !detectedVin) {
          detectedVin = vinHit;
        }
      } catch {
        /* try next 1A identification item */
      }
    }
  }

  // Fallback to Service 0x21 (21 80 / 21 87 / 21 90 / 21 99 / 21 81) or UDS 0x22 (22 F1 87 / F1 90)
  if (!partNumber || !detectedVin) {
    const partCandidates =
      profile.service === 0x21
        ? [profile.partId ?? [0x80], [0x87], [0x90], [0x99], [0x81]]
        : [profile.partId ?? [0xf1, 0x87], [0xf1, 0x91], [0xf1, 0x90]];

    for (const partId of partCandidates) {
      try {
        const idHex = partId.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
        const svcHex = profile.service.toString(16).padStart(2, "0").toUpperCase();
        const raw = await elm.sendPayload(`${svcHex}${idHex}`, 3_000);
        const payload = positiveEtacsPayload(raw, profile.service, partId);
        if (!payload || payload.length < 4) continue;
        const ascii = extractCleanAscii(payload);
        if (ascii) {
          const vinHit = extractVinFromAscii(ascii);
          if (vinHit && !detectedVin) detectedVin = vinHit;
          if (!partNumber) {
            const mitsuPn = extractPartNumberFromAscii(ascii);
            if (mitsuPn) {
              partNumber = mitsuPn.replace(/-[A-Z0-9]$/i, "");
            } else if (!vinHit) {
              partNumber = ascii;
            }
          }
          if (partNumber && detectedVin) break;
        }
      } catch {
        /* try next part LID */
      }
    }
  }

  return { partNumber, swVersion, detectedVin, idLids };
}

async function probeExtraEtacsLids(
  elm: Elm327Client,
  profile: EtacsCanProfile,
  skipIdHex: Set<string>,
  isEngine = false,
): Promise<{ extraLids: EtacsExtraLidItem[]; swVersion: string | null; vin: string | null }> {
  const extraLids: EtacsExtraLidItem[] = [];
  let swVersion: string | null = null;
  let vin: string | null = null;

  if (profile.service !== 0x21) {
    return { extraLids, swVersion, vin };
  }

  const probes: { lid: number; label: string }[] = isEngine
    ? [
        { lid: 0xc0, label: "Variant Coding ДВС C0 (21 C0)" },
        { lid: 0xc1, label: "Статусный регистр ДВС C1 (21 C1)" },
        { lid: 0x52, label: "Variant Coding ДВС (21 52)" },
        { lid: 0x42, label: "Variant Block 42 (21 42)" },
        { lid: 0x30, label: "Variant Block 30 (21 30)" },
        { lid: 0x32, label: "Variant Block 32 (21 32)" },
        { lid: 0x50, label: "Конфигурация / кодировка ДВС 50 (21 50)" },
        { lid: 0x51, label: "Конфигурация ДВС 51 (21 51)" },
        { lid: 0x53, label: "Конфигурация ДВС 53 (21 53)" },
        { lid: 0x54, label: "Конфигурация ДВС 54 (21 54)" },
        { lid: 0x60, label: "Кодировка опций ДВС 60 (21 60)" },
        { lid: 0x61, label: "Кодировка опций ДВС 61 (21 61)" },
        { lid: 0x62, label: "Кодировка опций ДВС 62 (21 62)" },
        { lid: 0x40, label: "Кодировка 40 (21 40)" },
        { lid: 0x41, label: "Кодировка 41 (21 41)" },
        { lid: 0xa0, label: "Регистр конфигурации A0 (21 A0)" },
        { lid: 0xb0, label: "Регистр конфигурации B0 (21 B0)" },
        { lid: 0x80, label: "Идентификатор ЭБУ / Part Number (21 80)" },
        { lid: 0x81, label: "Версия ПО / HW (21 81)" },
        { lid: 0x87, label: "Каталожный номер OEM (21 87)" },
        { lid: 0x90, label: "VIN в ЭБУ ДВС (21 90)" },
        { lid: 0x99, label: "Калибровка / серийный номер (21 99)" },
      ]
    : [
        { lid: 0xb0, label: "Variant Coding ETACS B0 (21 B0)" },
        { lid: 0xb2, label: "Custom Coding ETACS B2 (21 B2)" },
        { lid: 0xb1, label: "Custom Block B1 (21 B1)" },
        { lid: 0xe1, label: "Серийный номер ETACS E1 (21 E1)" },
        { lid: 0x52, label: "Variant Coding ETACS 52 (21 52)" },
        { lid: 0x51, label: "Custom Coding ETACS 51 (21 51)" },
        { lid: 0x50, label: "Конфигурация 50 (21 50)" },
        { lid: 0x42, label: "Variant / Option Block 42 (21 42)" },
        { lid: 0x43, label: "Custom / Option Block 43 (21 43)" },
        { lid: 0x30, label: "Статус / Variant 30 (21 30)" },
        { lid: 0x31, label: "Custom Coding 31 (21 31)" },
        { lid: 0x32, label: "Custom Coding 32 (21 32)" },
        { lid: 0x33, label: "Custom Coding 33 (21 33)" },
        { lid: 0x34, label: "Custom Coding 34 (21 34)" },
        { lid: 0x40, label: "Кодировка опций 40 (21 40)" },
        { lid: 0x41, label: "Кодировка опций 41 (21 41)" },
        { lid: 0x60, label: "Кодировка опций 60 (21 60)" },
        { lid: 0x62, label: "Кодировка опций 62 (21 62)" },
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
      const vinHit = extractVinFromAscii(ascii);
      if ((probe.lid === 0x90 || vinHit) && (vinHit ?? ascii) && !vin) {
        vin = vinHit ?? ascii;
      }
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
        ? [
            profile.variantId,
            [0xc0],
            [0x32],
            [0x42],
            [0x52],
            [0x50],
            [0x51],
            [0x53],
            [0x54],
            [0x60],
            [0x61],
            [0x62],
            [0x63],
            [0x64],
            [0x40],
            [0x41],
            [0x43],
            [0x44],
            [0x31],
            [0x33],
            [0x34],
            [0xa0],
            [0xb0],
            [0xd0],
            [0xe0],
            [0xf0],
          ]
        : [
            profile.variantId,
            [0xb0],
            [0x52],
            [0x42],
            [0x50],
            [0x40],
            [0x51],
            [0x53],
            [0x54],
            [0x60],
            [0x62],
            [0xa0],
            [0xc0],
            [0x33],
            [0x41],
          ]
      : [profile.variantId, [0x01, 0x32], [0x01, 0x42], [0x01, 0x50], [0x01, 0x52], [0xb0, 0x01]];

  const customCandidates =
    profile.service === 0x21
      ? [
          profile.customId,
          [0xb2],
          [0xb1],
          [0xb0],
          [0x51],
          [0x43],
          [0x33],
          [0x34],
          [0x35],
          [0x36],
          [0x52],
          [0x53],
          [0x54],
          [0x40],
          [0x41],
          [0x44],
          [0x60],
          [0x61],
          [0x62],
          [0xa1],
          [0xa2],
          [0xc1],
          [0xc2],
          [0x32],
        ]
      : [profile.customId, [0x01, 0x32], [0x01, 0x43], [0xb1, 0x01], [0xb2, 0x01]];

  let variant: { payload: Uint8Array; raw: string; usedIdHex: string } | null = null;
  let variantError: unknown = null;

  try {
    variant = await readCodingBlockWithFallbacks(elm, profile, variantCandidates, {
      // On ETACS 8637C671 (620->504), 21 30 can return a 1-byte status ("02"); require >=4 bytes
      // on the first pass so we continue to 21 52 / 21 42 / 21 50 / 21 B0 if a multi-byte table exists.
      minBytes: isEngine ? 2 : 4,
      fallbackSessions:
        profile.service === 0x21
          ? isEngine
            ? ["1081", "1092"]
            : ["1089", "1081"]
          : undefined,
    });
  } catch (err) {
    variantError = err;
  }

  // Engine ECUs (1860xxxx on 7E0->7E8) ONLY have Variant Coding (.kon, e.g. 21 C0) and NEVER have a
  // Customer Coding (.cuf) file in MMCodingWriter / MUT-III (any 21 C1 on 7E0->7E8 is just a 1-byte
  // status register `05` followed by the 4-byte KWP trailer `A0 05 A0 01`).
  // Only ETACS modules (620->504 / 7A1->7A0 / 710->718) have a `.cuf` Custom Coding block.
  let customPayload: Uint8Array = new Uint8Array(0);
  let customRaw = "";
  let customUsedId: string | undefined;
  let customStatusNote: string | null = null;

  if (variant) {
    if (isEngine) {
      customStatusNote =
        "Кодировка ЭБУ двигателя (.kon) успешно считана. Для блока двигателя используется один файл Variant (.kon) и резервная копия (.json) — отдельного файла .cuf у ЭБУ ДВС нет.";
    } else {
      try {
        const filteredCustom = customCandidates.filter(
          (cand) => `21 ${cand.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("")}` !== variant!.usedIdHex,
        );
        const custom = await readCodingBlockWithFallbacks(elm, profile, filteredCustom, {
          // Require >= 16 bytes on the first pass so a 7-byte status register on 21 32 / 21 B1 ("5B 0D 04 FF FF FF FF")
          // is skipped in favor of the full 65-byte Custom Coding table (21 B2 / 21 51 / 21 31 / 21 43) across 10 92 / 10 89.
          minBytes: 16,
          fallbackSessions:
            profile.service === 0x21
              ? ["1089", "1092", "1081"]
              : undefined,
        });
        customPayload = custom.payload;
        customRaw = custom.raw;
        customUsedId = custom.usedIdHex;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        customRaw = msg;
        customStatusNote =
          "Блок ETACS отдал основную кодировку Variant (.kon), но не поддерживает отдельный блок Custom (.cuf — ответ 7F 21 12). Вы можете сразу скачать .kon и .json.";
      }
    }
  }

  const { partNumber, swVersion: idSwVersion, detectedVin, idLids } = await tryReadPartNumber(elm, profile);
  const skipSet = new Set<string>();
  if (variant?.usedIdHex) skipSet.add(variant.usedIdHex);
  if (customUsedId) skipSet.add(customUsedId);
  const { extraLids: probedLids, swVersion: extraSwVersion, vin: extraVin } = await probeExtraEtacsLids(
    elm,
    profile,
    skipSet,
    isEngine,
  );
  const extraLids = [...idLids, ...probedLids];
  const swVersion = idSwVersion ?? extraSwVersion;
  const vin = detectedVin ?? extraVin;

  // Reset Flow Control mode to automatic (ATFCSM0) so subsequent standard UDS requests work normally
  try {
    await elm.sendCommand("ATFCSM0");
  } catch {
    /* ignore */
  }

  // If Engine ECU (7E0->7E8, e.g. Pajero Sport V6 6B31 1860D362) returned 7F 21 12 on all standard
  // variant coding LIDs across 10 89 / 10 81 / 10 92, but IS online and returned ECU passport/calibration
  // registers (21 80, 21 81, 21 87, 21 90, 21 99), construct a valid Engine ECU dump instead of failing!
  if (!variant) {
    if (isEngine && extraLids.length > 0) {
      const preferredExtra =
        extraLids.find((item) => item.lidHex === "21 99") ??
        extraLids.find((item) => item.lidHex === "21 80") ??
        extraLids.find((item) => item.lidHex === "21 81") ??
        extraLids[0]!;
      variant = {
        payload: preferredExtra.payload,
        raw: bytesToHex(preferredExtra.payload),
        usedIdHex: preferredExtra.lidHex,
      };
      const errMsg = variantError instanceof Error ? variantError.message : String(variantError ?? "");
      customRaw = errMsg;
      customStatusNote = `ЭБУ двигателя (7E0→7E8) на связи и отдал регистры (${extraLids.map((e) => e.lidHex).join(", ")}), но на запросы отдельной таблицы Variant Coding (21 30/32/42/50/52/60/62 в сессиях 10 89 / 10 81 / 10 92) ответил 7F 21 12 (subFunctionNotSupported). На бензиновом 3.0 V6 6B31 (1860D362) опции автомобиля хранятся в ETACS (620→504); в .kon подставлен паспортный регистр ${preferredExtra.lidHex} (ниже можно выбрать любой регистр кнопкой «В .kon»).`;
    } else {
      try {
        await elm.sendCommand("ATFCSM0");
      } catch {
        /* ignore */
      }
      throw variantError instanceof Error ? variantError : new Error(String(variantError));
    }
  } else if (!isEngine && variant.payload.length < 4 && customPayload.length >= 4) {
    // On ETACS 8637C671 (620->504), if 21 30 returned only a 1-byte status ("02") while 21 32 returned
    // the 7-byte coding block ("5B 0D 04 FF FF FF FF"), preserve 21 30 in extraLids and warn the user
    // that 21 30 is 1 byte so they can also assign any multi-byte block to .kon if needed.
    if (!extraLids.some((e) => e.lidHex === variant!.usedIdHex)) {
      extraLids.unshift({
        lidHex: variant.usedIdHex,
        label: `Статус / короткий регистр (${variant.usedIdHex})`,
        payload: variant.payload,
        ascii: extractCleanAscii(variant.payload),
      });
    }
    customStatusNote =
      customStatusNote ??
      `Внимание: регистр ${variant.usedIdHex} на блоке ${profile.txId.toString(16).toUpperCase()}/${profile.rxId.toString(16).toUpperCase()} вернул короткий ответ (${variant.payload.length} Б: ${bytesToHex(variant.payload)}), а основная таблица (${customPayload.length} Б) считана из ${customUsedId ?? "21 32"}. При необходимости нажмите «В .kon» у нужного регистра ниже.`;
  }

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

/** MMCodingWriter / MUT Coding filenames (`8637C671_MMEMCY1XXNH003447_20261019_1.kon`). */
export function etacsDownloadNames(
  prefix: string,
  meta?: { partNumber?: string | null; vin?: string | null; date?: Date },
): { kon: string; cuf: string; json: string } {
  const partClean = (meta?.partNumber ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const vinClean = (meta?.vin ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (partClean.length >= 6) {
    const d = meta?.date ?? new Date();
    const ymd = [
      d.getFullYear().toString().padStart(4, "0"),
      (d.getMonth() + 1).toString().padStart(2, "0"),
      d.getDate().toString().padStart(2, "0"),
    ].join("");
    const stem = vinClean.length >= 11 ? `${partClean}_${vinClean}_${ymd}_1` : `${partClean}_${ymd}_1`;
    return {
      kon: `${stem}.kon`,
      cuf: `${stem}.cuf`,
      json: `${stem}_backup.json`,
    };
  }
  const safe = prefix.replace(/[^\w\-]+/g, "_").slice(0, 40);
  return {
    kon: `${safe}_variant.kon`,
    cuf: `${safe}_custom.cuf`,
    json: `${safe}_etacs_backup.json`,
  };
}

/**
 * CRC-16/X25 (poly 0x1021, init 0xFFFF, refin=true, refout=true, xorout=0xFFFF)
 * used by Mitsubishi MUT-III / MMCodingWriter over the 512-byte coding field (offset 200..712).
 */
export function crc16X25Ascii(asciiField512: string): string {
  let crc = 0xffff;
  for (let i = 0; i < asciiField512.length; i++) {
    const b = asciiField512.charCodeAt(i) & 0xff;
    let reflectedByte = 0;
    for (let k = 0; k < 8; k++) {
      reflectedByte = (reflectedByte << 1) | ((b >> k) & 1);
    }
    crc ^= reflectedByte << 8;
    for (let k = 0; k < 8; k++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  let reflectedCrc = 0;
  for (let k = 0; k < 16; k++) {
    reflectedCrc = (reflectedCrc << 1) | ((crc >> k) & 1);
  }
  const finalCrc = (reflectedCrc ^ 0xffff) & 0xffff;
  return finalCrc.toString(16).padStart(4, "0").toUpperCase();
}

/**
 * Build an authentic 1233-byte Mitsubishi MUT-III / MMCodingWriter `.kon` or `.cuf` container file:
 * - Bytes `0..2`: UTF-8 BOM (`EF BB BF`)
 * - Bytes `3..1232`: 1230 ASCII characters padded with spaces (`0x20`):
 *   - Offset `2`: 17-char VIN (e.g. `MMEMCY1XXNH003447`)
 *   - Offset `80`: 12-char timestamp `YYYYMMDDHHmm` (e.g. `202610191736`)
 *   - Offset `162`: 8-char ECU Part Number (`8637C671` or `1860D362`)
 *   - Offset `200..711`: 512-char block 1 (uppercase hex coding string, space-padded to 512 chars)
 *   - Offset `712..1223`: 512-char block 2 (duplicate uppercase hex coding string, space-padded to 512 chars)
 *   - Offset `1224..1227`: 4-char CRC-16/X25 checksum of `offset 200..712`
 */
export function formatMutCodingContainer(options: {
  payload: Uint8Array;
  partNumber?: string | null;
  vin?: string | null;
  timestamp?: Date | string;
}): Uint8Array {
  const buf = new Array<string>(1230).fill(" ");
  const writeAt = (offset: number, text: string, maxLen: number) => {
    const clean = text.slice(0, maxLen);
    for (let i = 0; i < clean.length && offset + i < 1230; i++) {
      buf[offset + i] = clean[i]!;
    }
  };

  const vinStr = (options.vin ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "00000000000000000";
  const partStr = (options.partNumber ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "86370000";

  let dateStr: string;
  if (typeof options.timestamp === "string" && /^\d{12}$/.test(options.timestamp)) {
    dateStr = options.timestamp;
  } else {
    const d = options.timestamp instanceof Date ? options.timestamp : new Date();
    dateStr = [
      d.getFullYear().toString().padStart(4, "0"),
      (d.getMonth() + 1).toString().padStart(2, "0"),
      d.getDate().toString().padStart(2, "0"),
      d.getHours().toString().padStart(2, "0"),
      d.getMinutes().toString().padStart(2, "0"),
    ].join("");
  }

  let cleanPayload = options.payload;
  if (
    cleanPayload.length > 8 &&
    cleanPayload[cleanPayload.length - 4] === 0xa0 &&
    cleanPayload[cleanPayload.length - 3] === 0x05 &&
    cleanPayload[cleanPayload.length - 2] === 0xa0 &&
    cleanPayload[cleanPayload.length - 1] === 0x01
  ) {
    cleanPayload = cleanPayload.slice(0, cleanPayload.length - 4);
  }

  const codingHex = bytesToHex(cleanPayload, "");
  writeAt(2, vinStr, 17);
  writeAt(80, dateStr, 12);
  writeAt(162, partStr, 16);
  writeAt(200, codingHex, 512);
  writeAt(712, codingHex, 512);

  const field512 = buf.slice(200, 712).join("");
  const crcHex = crc16X25Ascii(field512);
  writeAt(1224, crcHex, 4);

  const asciiBytes = new TextEncoder().encode(buf.join(""));
  const out = new Uint8Array(3 + asciiBytes.length);
  out[0] = 0xef;
  out[1] = 0xbb;
  out[2] = 0xbf;
  out.set(asciiBytes, 3);
  return out;
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
  const hasUtf8Bom =
    fileBuffer.length >= 3 &&
    fileBuffer[0] === 0xef &&
    fileBuffer[1] === 0xbb &&
    fileBuffer[2] === 0xbf;
  const contentBuffer = hasUtf8Bom ? fileBuffer.subarray(3) : fileBuffer;

  const isPrintableText = Array.from(contentBuffer).every(
    (b) => b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e),
  );

  // Check for standard 1230/1233-byte Mitsubishi MUT-III / MMCodingWriter container format:
  // [VIN at 2..19] [Timestamp at 80..92] [PartNumber at 162..178] [CodingHex1 at 200..712] [CodingHex2 at 712..1224] [CRC16 at 1224..1228]
  if (isPrintableText && contentBuffer.length >= 400) {
    const asciiText = new TextDecoder().decode(contentBuffer);
    const partSlice = asciiText.slice(160, 195).trim();
    const block1Slice = asciiText.slice(200, 712).trim();
    if (
      /^[0-9A-Fa-f]{8,512}$/.test(block1Slice) &&
      block1Slice.length % 2 === 0 &&
      /^(?:8637|1860|[A-Z0-9]{6,12})/i.test(partSlice)
    ) {
      const out = new Uint8Array(block1Slice.length / 2);
      for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(block1Slice.slice(i * 2, i * 2 + 2), 16);
      }
      return {
        payload: out,
        detectedPartNumber: partSlice || null,
        detectedLidHex: null,
      };
    }
  }

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
 * Build explicit ISO 15765-2 (ISO-TP) 8-byte CAN frames for a multi-frame PDU
 * when ELM327 / vLinker rejects a single >7-byte hex string with `?` (because
 * standard ELM327 command parser only accepts up to 7/8 data bytes per line).
 *
 * - Single Frame (`len <= 7`): `[0x00 | len, ...pdu]` (padded to 8 bytes with `0x00`)
 * - First Frame (`len > 7`): `[0x10 | ((len >> 8) & 0x0F), len & 0xFF, pdu[0..5]]`
 * - Consecutive Frames: `[0x20 | (seq & 0x0F), ...chunk]` (seq = 1..15, wraps to 0..15, padded to 8 bytes with `0x00`)
 */
export function buildIsoTpFrames(pdu: Uint8Array): string[] {
  const totalLen = pdu.length;
  if (totalLen <= 7) {
    const frame = new Uint8Array(8);
    frame[0] = totalLen & 0x0f;
    frame.set(pdu, 1);
    return [bytesToHex(frame, "")];
  }

  const frames: string[] = [];
  const ff = new Uint8Array(8);
  ff[0] = 0x10 | ((totalLen >> 8) & 0x0f);
  ff[1] = totalLen & 0xff;
  ff.set(pdu.subarray(0, 6), 2);
  frames.push(bytesToHex(ff, ""));

  let offset = 6;
  let seq = 1;
  while (offset < totalLen) {
    const cf = new Uint8Array(8);
    cf[0] = 0x20 | (seq & 0x0f);
    const slice = pdu.subarray(offset, Math.min(offset + 7, totalLen));
    cf.set(slice, 1);
    frames.push(bytesToHex(cf, ""));
    offset += 7;
    seq = (seq + 1) & 0x0f;
  }
  return frames;
}

function isElmSyntaxRejection(raw: string): boolean {
  const clean = raw.replace(/>/g, "").trim();
  if (!clean) return true;
  if (clean === "?") return true;
  const tokens = extractHexTokens(raw);
  return tokens.length === 0 && clean.includes("?");
}

function isNoDataOrEmptyReply(raw: string): boolean {
  const clean = raw.replace(/>/g, "").trim();
  if (!clean) return true;
  if (/^(NO DATA|STOPPED|\?|OK)$/i.test(clean)) return true;
  return extractHexTokens(raw).length === 0;
}

function hasPositiveWriteAck(tokens: number[], expectPosSid: number, targetId: number[]): boolean {
  return tokens.some((b, idx) => {
    if (b !== expectPosSid) return false;
    if (idx + targetId.length >= tokens.length) return true;
    return targetId.every((idByte, k) => tokens[idx + 1 + k] === idByte);
  });
}

function hasNegativeResponseForService(tokens: number[], writeSvc: number): number | null {
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (tokens[i] === 0x7f && tokens[i + 1] === writeSvc) {
      return tokens[i + 2]!;
    }
  }
  return null;
}

/**
 * Fast probe for active ETACS / Engine CAN profile and exact LID for writing,
 * WITHOUT running the 60-second `probeExtraEtacsLids` scan (which lets the KWP
 * diagnostic session time out before the write command is sent).
 */
async function resolveWriteProfileAndLid(
  elm: Elm327Client,
  profile: EtacsCanProfile,
  kind: "kon" | "cuf",
): Promise<{ activeProfile: EtacsCanProfile; detectedReadId?: string }> {
  const candidates =
    profile.id === "auto"
      ? ETACS_PROFILES.filter((item) => item.id !== "auto" && item.moduleKind !== "engine")
      : profile.id === "engine-auto"
        ? ETACS_PROFILES.filter((item) => item.id !== "engine-auto" && item.moduleKind === "engine")
        : [profile];

  for (const cand of candidates) {
    try {
      await configureEtacsChannel(elm, cand);
      const isEngine = cand.moduleKind === "engine" || cand.txId === 0x7e0;
      const readList =
        cand.service === 0x21
          ? kind === "cuf"
            ? [cand.customId, [0xb2], [0x31], [0x51], [0x43], [0xb1], [0x32]]
            : isEngine
              ? [cand.variantId, [0xc0], [0x32], [0x42], [0x52], [0x50]]
              : [cand.variantId, [0xb0], [0x52], [0x42], [0x50], [0x40]]
          : kind === "cuf"
            ? [cand.customId, [0x01, 0x31], [0x01, 0x32], [0xb2, 0x01]]
            : [cand.variantId, [0x01, 0x30], [0x01, 0x32], [0xb0, 0x01]];

      const hit = await readCodingBlockWithFallbacks(elm, cand, readList, {
        minBytes: kind === "cuf" ? 16 : isEngine ? 2 : 4,
        fallbackSessions: cand.service === 0x21 ? ["1092", "1089", "1081"] : undefined,
      });
      return { activeProfile: cand, detectedReadId: hit.usedIdHex };
    } catch {
      /* try next candidate profile */
    }
  }

  return {
    activeProfile: candidates[0] ?? profile,
    detectedReadId: undefined,
  };
}

/**
 * Send a multi-byte write PDU (`3B <LID> <DATA...>` or `2E <DID_HI> <DID_LO> <DATA...>`)
 * with 3-tier fallback so it works on all ELM327 / STN / vLinker MC-IOS / Android adapters:
 *
 * 1. Direct hex line (`3BB2...`) — works on adapters with large UART line buffer & auto ISO-TP.
 * 2. STN / vLinker `STPX` command (`STPX h:620, d:3BB2..., t:10000`) if direct line returns `?` or `NO DATA`.
 * 3. Explicit ISO-TP framing (`ATCAF0` + First Frame `10 xx ...` + Flow Control `30 ...` +
 *    Consecutive Frames `21 ...`, `22 ...` with `0` at the end so ELM doesn't wait for a reply on intermediate CFs)
 *    — works on every ELM327 / vLinker because each command is a standard 8-byte (16-hex-char) CAN frame!
 */
async function sendCodingWritePdu(
  elm: Elm327Client,
  profile: EtacsCanProfile,
  writeSvc: number,
  targetId: number[],
  payload: Uint8Array,
): Promise<string> {
  const expectPosSid = (writeSvc + 0x40) & 0xff;
  const pdu = new Uint8Array(1 + targetId.length + payload.length);
  pdu[0] = writeSvc & 0xff;
  for (let i = 0; i < targetId.length; i++) {
    pdu[1 + i] = targetId[i]! & 0xff;
  }
  pdu.set(payload, 1 + targetId.length);

  const fullHex = bytesToHex(pdu, "");

  // Tier 1: Direct hex payload (fast path for single-frame or adapters with auto multi-frame TX & test mocks)
  const directResp = await elm.sendPayload(fullHex, 15_000);
  if (!isElmSyntaxRejection(directResp) && (!isNoDataOrEmptyReply(directResp) || pdu.length <= 7)) {
    return directResp;
  }

  // Tier 2: STN / vLinker extended transmit `STPX` (supported on STN11xx/21xx & vLinker MC+/BM+/FD+/MC-IOS).
  // Include explicit `r:<rxHex>` for non-standard CAN pairs like 620->504 so STPX listens on 504!
  const txHex = profile.txId.toString(16).padStart(3, "0").toUpperCase();
  const rxHex = profile.rxId.toString(16).padStart(3, "0").toUpperCase();
  for (const stpxCmd of [
    `STPXh:${txHex},r:${rxHex},d:${fullHex},t:10000`,
    `STPXh:${txHex},d:${fullHex},t:10000`,
    `STPXd:${fullHex},t:10000`,
  ]) {
    try {
      const stpxResp = await elm.sendCommand(stpxCmd, 15_000);
      if (!isElmSyntaxRejection(stpxResp) && !isNoDataOrEmptyReply(stpxResp)) {
        const stpxTokens = extractHexTokens(stpxResp);
        if (
          hasPositiveWriteAck(stpxTokens, expectPosSid, targetId) ||
          hasNegativeResponseForService(stpxTokens, writeSvc) !== null
        ) {
          return stpxResp;
        }
      }
    } catch {
      /* STPX variant not supported, continue */
    }
  }

  // Tier 3: Manual ISO-TP multi-frame transmission with ATCAF0 (raw 8-byte CAN frames)
  const frames = buildIsoTpFrames(pdu);
  try {
    await elm.sendCommand("ATCAF0", 2_500, { quietMs: 5, allowBarePrompt: true });
    let lastReply = "";
    if (frames.length === 1) {
      lastReply = await elm.sendPayload(frames[0]!, 10_000);
    } else {
      // Refresh KWP diagnostic session (04 10 92 00 00 00 00 00) right before First Frame
      // so the session timer S3 is 100% fresh when the First Frame hits the CAN bus.
      if (profile.service === 0x21) {
        try {
          await elm.sendPayload("0210920000000000 1", 2_000, { quietMs: 5, allowBarePrompt: true });
        } catch {
          /* ignore */
        }
      }

      // Send First Frame (`10 LL ... 1`) — trailing `1` tells ELM327 to return immediately upon receiving
      // the single Flow Control frame (`30 BS STmin ...`) from the ECU instead of waiting 1020ms (`ATSTFF`)!
      let ffResp = await elm.sendPayload(`${frames[0]!} 1`, 5_000, {
        quietMs: 5,
        allowBarePrompt: true,
      });
      if (isElmSyntaxRejection(ffResp)) {
        ffResp = await elm.sendPayload(frames[0]!, 5_000, {
          quietMs: 5,
          allowBarePrompt: true,
        });
      }

      const ffTokens = extractHexTokens(ffResp);
      // If ECU immediately replied with a negative response (e.g. 03 7F 3B 22 / 7F 3B 12 / 7F 3B 33) on the First Frame, return it!
      if (hasNegativeResponseForService(ffTokens, writeSvc) !== null) {
        return ffResp;
      }

      // Send Consecutive Frames (`21...`, `22...`, ...).
      // Intermediate CFs have NO reply from the ECU:
      // - First try ELM327 ` 0` frame-count suffix (`2140404040404040 0`), which tells ELM/vLinker
      //   to transmit the frame and print `>` immediately with 0ms RX wait!
      // - Also set `ATST01` (4ms timeout) as fallback in case a clone ignores ` 0`.
      if (frames.length > 2) {
        try {
          await elm.sendCommand("ATST01", 2_000, { quietMs: 5, allowBarePrompt: true });
        } catch {
          /* ignore */
        }
      }

      let useZeroReplySuffix = true;
      for (let i = 1; i < frames.length; i++) {
        const isLast = i === frames.length - 1;
        if (isLast) {
          if (frames.length > 2) {
            try {
              await elm.sendCommand("ATSTFF", 2_000, { quietMs: 5, allowBarePrompt: true });
            } catch {
              /* ignore */
            }
          }
          // On the final Consecutive Frame, expect 1 response frame (`02 7B B2 ...`) from the ECU
          let cfResp = await elm.sendPayload(`${frames[i]!} 1`, 12_000, { quietMs: 20 });
          if (isElmSyntaxRejection(cfResp)) {
            cfResp = await elm.sendPayload(frames[i]!, 12_000, { quietMs: 20 });
          }
          lastReply = cfResp;
        } else {
          if (useZeroReplySuffix) {
            const cf0Resp = await elm.sendPayload(`${frames[i]!} 0`, 1_500, {
              quietMs: 2,
              allowBarePrompt: true,
            });
            if (isElmSyntaxRejection(cf0Resp)) {
              useZeroReplySuffix = false;
              await elm.sendPayload(frames[i]!, 1_500, {
                quietMs: 2,
                allowBarePrompt: true,
              });
            }
          } else {
            await elm.sendPayload(frames[i]!, 1_500, {
              quietMs: 2,
              allowBarePrompt: true,
            });
          }
        }
      }

      // If final CF returned NO DATA, include First Frame response diagnostics so we can see if FC (30) arrived
      if (isNoDataOrEmptyReply(lastReply) && !isNoDataOrEmptyReply(ffResp)) {
        const ffClean = ffResp.replace(/>/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
        lastReply = `FF:${ffClean} -> CF:NO DATA`;
      }
    }
    return lastReply;
  } finally {
    try {
      await elm.sendCommand("ATSTFF", 2_000, { quietMs: 5, allowBarePrompt: true });
      await elm.sendCommand("ATCAF1", 2_000, { quietMs: 5, allowBarePrompt: true });
    } catch {
      /* restore ISO-TP auto formatting */
    }
  }
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

  // If "auto" or "engine-auto" was selected, resolve the concrete profile quickly without 60s extra LID scan
  let activeProfile = profile;
  let detectedReadId: string | undefined;
  if (profile.id === "auto" || profile.id === "engine-auto") {
    const resolvedInfo = await resolveWriteProfileAndLid(elm, profile, kind);
    activeProfile = resolvedInfo.activeProfile;
    detectedReadId = resolvedInfo.detectedReadId;
  }

  await configureEtacsChannel(elm, activeProfile);

  const defaultId = kind === "kon" ? activeProfile.variantId : activeProfile.customId;
  const targetId = parseLidBytesFromReadId(overrideLidHex ?? detectedReadId, defaultId);
  const idHex = targetId.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
  const writeSvc = activeProfile.service === 0x21 ? 0x3b : 0x2e;
  const expectPosSid = (writeSvc + 0x40) & 0xff; // 0x7B for KWP 3B, 0x6E for UDS 2E
  const writeSvcHex = writeSvc.toString(16).padStart(2, "0").toUpperCase();

  // Build candidate write attempts:
  // 1. Primary targetId + exact payload
  // 2. If ETACS KWP 0x21 .cuf (65 bytes) is rejected with NRC 0x12 / 0x13 / 0x22 / 0x31 on `3B B2`,
  //    also try with the 4-byte KWP coding trailer `A0 05 A0 01` and fallback ETACS Custom LIDs (`31`, `51`, `43`).
  const candidateTargets: { lid: number[]; data: Uint8Array }[] = [
    { lid: targetId, data: payload },
  ];

  if (activeProfile.service === 0x21 && kind === "cuf") {
    const withTrailer = new Uint8Array(payload.length + 4);
    withTrailer.set(payload, 0);
    withTrailer.set([0xa0, 0x05, 0xa0, 0x01], payload.length);
    candidateTargets.push({ lid: targetId, data: withTrailer });

    const fallbackCufLids = [[0xb2], [0x31], [0x51], [0x43], [0xb1], [0x32]];
    for (const altLid of fallbackCufLids) {
      if (altLid.length === targetId.length && altLid.every((b, idx) => b === targetId[idx])) {
        continue;
      }
      candidateTargets.push({ lid: altLid, data: payload });
    }
  } else if (activeProfile.service === 0x21 && kind === "kon") {
    const withTrailer = new Uint8Array(payload.length + 4);
    withTrailer.set(payload, 0);
    withTrailer.set([0xa0, 0x05, 0xa0, 0x01], payload.length);
    candidateTargets.push({ lid: targetId, data: withTrailer });
  }

  let rawWriteResponse = "";
  let firstAttemptDiag = "";
  let tokens: number[] = [];
  let isPositive = false;
  let usedTargetId = targetId;
  let usedIdHex = idHex;

  for (let attemptIdx = 0; attemptIdx < candidateTargets.length; attemptIdx++) {
    const cand = candidateTargets[attemptIdx]!;
    usedTargetId = cand.lid;
    usedIdHex = cand.lid.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");

    // Keep diagnostic session alive before each write candidate
    if (attemptIdx > 0 && activeProfile.service === 0x21) {
      const sessCmd = attemptIdx % 2 === 1 ? "1092" : "1089";
      try {
        await elm.sendPayload(sessCmd, 2_000);
        await elm.sendPayload("3E", 1_500);
      } catch {
        /* ignore */
      }
    }

    rawWriteResponse = await sendCodingWritePdu(
      elm,
      activeProfile,
      writeSvc,
      cand.lid,
      cand.data,
    );
    if (attemptIdx === 0) {
      firstAttemptDiag = rawWriteResponse;
    }
    tokens = extractHexTokens(rawWriteResponse);
    isPositive = hasPositiveWriteAck(tokens, expectPosSid, cand.lid);
    if (isPositive) break;
  }

  if (!isPositive) {
    // Check for negative response 7F <svc> <nrc>
    const bestDiag =
      !isNoDataOrEmptyReply(firstAttemptDiag) && isNoDataOrEmptyReply(rawWriteResponse)
        ? firstAttemptDiag
        : firstAttemptDiag || rawWriteResponse;
    let nrcDetail = bestDiag.replace(/>/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "NO DATA";
    const diagTokens = extractHexTokens(bestDiag);
    const nrcByte =
      hasNegativeResponseForService(diagTokens, writeSvc) ??
      hasNegativeResponseForService(tokens, writeSvc);
    if (nrcByte !== null) {
      const nrc = nrcByte.toString(16).padStart(2, "0").toUpperCase();
      nrcDetail = `7F ${writeSvcHex} ${nrc}`;
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
    const verifyRaw = await elm.sendPayload(`${readSvcHex}${usedIdHex}`, 10_000);
    const verifyPayload = positiveEtacsPayload(verifyRaw, activeProfile.service, usedTargetId);
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
        ? `Variant (.kon, ${payload.length} Б) успешно записан и проверен по чтению! Внимание: при записи .kon блок ETACS сбрасывает настройки .cuf на базовые — теперь обязательно запишите ваш файл .cuf вторым шагом (затем выключите зажигание OFF на 5–10 сек).`
        : `Variant (.kon, ${payload.length} Б) принят блоком (ответ ${expectPosSid.toString(16).toUpperCase()} ${usedIdHex}). Внимание: после записи .kon настройки .cuf сбрасываются на базовые — запишите ваш файл .cuf отдельно вторым шагом (затем выключите зажигание OFF на 5–10 сек).`
      : verified
        ? `Custom (.cuf, ${payload.length} Б) успешно записан и проверен по чтению! Пользовательские настройки восстановлены. Выключите зажигание (OFF) на 5–10 секунд для фиксации изменений в блоке.`
        : `Custom (.cuf, ${payload.length} Б) принят блоком (ответ ${expectPosSid.toString(16).toUpperCase()} ${usedIdHex}). Выключите зажигание (OFF) на 5–10 секунд для фиксации в памяти.`;

  return {
    kind,
    profileId: activeProfile.id,
    txHex: activeProfile.txId.toString(16).toUpperCase(),
    rxHex: activeProfile.rxId.toString(16).toUpperCase(),
    writeCommandHex: `${writeSvcHex} ${usedIdHex}`,
    writtenBytes: payload.length,
    verified,
    rawWriteResponse,
    note,
  };
}

