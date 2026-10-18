import { bytesToHex, extractHexTokens, stripElmMultiline } from "./hex";
import type { Elm327Client } from "./elm327";

export interface EtacsCanProfile {
  id: string;
  label: string;
  txId: number;
  rxId: number;
  /** Primary service: 0x21 (KWP ReadDataByLocalIdentifier) or 0x22 (UDS ReadDataByIdentifier). */
  service: 0x21 | 0x22;
  /** Identifier for variant coding (MMCodingWriter / MUT .kon). */
  variantId: number[];
  /** Identifier for custom coding (.cuf). */
  customId: number[];
  /** Optional identifier for ECU part/SW number. */
  partId?: number[];
}

/** Common Mitsubishi ETACS addressing (11-bit 500k CAN). */
export const ETACS_PROFILES: EtacsCanProfile[] = [
  {
    id: "auto",
    label: "Автопоиск ETACS (620 / 7A1 / 710, KWP 21 и UDS 22)",
    txId: 0x620,
    rxId: 0x504,
    service: 0x21,
    variantId: [0x30],
    customId: [0x31],
    partId: [0x80],
  },
  {
    id: "620-504",
    label: "ETACS 620 → 504 · KWP 21 (Pajero Sport / L200 / Triton / Outlander)",
    txId: 0x620,
    rxId: 0x504,
    service: 0x21,
    variantId: [0x30],
    customId: [0x31],
    partId: [0x80],
  },
  {
    id: "7a1-7a0",
    label: "ETACS 7A1 → 7A0 · KWP 21 (Outlander XL/III, ASX, Lancer X)",
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
    txId: 0x7a1,
    rxId: 0x7a0,
    service: 0x22,
    variantId: [0x01, 0x30],
    customId: [0x01, 0x31],
    partId: [0xf1, 0x87],
  },
];

export interface EtacsCodingDump {
  profileId: string;
  profileLabel: string;
  txHex: string;
  rxHex: string;
  partNumber: string | null;
  variant: Uint8Array;
  custom: Uint8Array;
  rawVariantResponse: string;
  rawCustomResponse: string;
  variantUsedId?: string;
  customUsedId?: string;
  customStatusNote?: string | null;
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
      const ascii = Array.from(payload)
        .filter((b) => b >= 0x20 && b <= 0x7e)
        .map((b) => String.fromCharCode(b))
        .join("")
        .trim();
      if (ascii.length >= 4) return ascii;
    } catch {
      /* try next part LID */
    }
  }
  return null;
}

async function readSingleEtacsProfile(
  elm: Elm327Client,
  profile: EtacsCanProfile,
): Promise<EtacsCodingDump> {
  await configureEtacsChannel(elm, profile);

  const variantCandidates =
    profile.service === 0x21
      ? [profile.variantId, [0x42], [0x50], [0xb0]]
      : [profile.variantId, [0x01, 0x42], [0xb0, 0x01]];

  const customCandidates =
    profile.service === 0x21
      ? [profile.customId, [0x32], [0x43], [0x51], [0x40], [0x52], [0xb1]]
      : [profile.customId, [0x01, 0x32], [0x01, 0x43], [0xb1, 0x01]];

  const variant = await readCodingBlockWithFallbacks(elm, profile, variantCandidates);

  // Some Mitsubishi ETACS units (especially on 620 -> 504) support Variant Coding (21 30 -> .kon)
  // and return 7F 21 12 (subFunctionNotSupported) for Custom Coding (21 31 -> .cuf) when custom
  // parameters are either stored in a different LID or not separate from Variant Coding.
  // Never discard a valid .kon dump just because .cuf returned 7F 21 12!
  let customPayload: Uint8Array = new Uint8Array(0);
  let customRaw = "";
  let customUsedId: string | undefined;
  let customStatusNote: string | null = null;

  try {
    const custom = await readCodingBlockWithFallbacks(elm, profile, customCandidates);
    customPayload = custom.payload;
    customRaw = custom.raw;
    customUsedId = custom.usedIdHex;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    customRaw = msg;
    customStatusNote =
      "Блок ETACS отдал основную кодировку Variant (.kon), но не поддерживает отдельный блок Custom (.cuf — ответ 7F 21 12). Вы можете сразу скачать .kon и .json.";
  }

  const partNumber = await tryReadPartNumber(elm, profile);

  // Reset Flow Control mode to automatic (ATFCSM0) so subsequent standard UDS requests work normally
  try {
    await elm.sendCommand("ATFCSM0");
  } catch {
    /* ignore */
  }

  return {
    profileId: profile.id,
    profileLabel: profile.label,
    txHex: profile.txId.toString(16).toUpperCase(),
    rxHex: profile.rxId.toString(16).toUpperCase(),
    partNumber,
    variant: variant.payload,
    custom: customPayload,
    rawVariantResponse: variant.raw,
    rawCustomResponse: customRaw,
    variantUsedId: variant.usedIdHex,
    customUsedId,
    customStatusNote,
  };
}

export async function readEtacsCoding(
  elm: Elm327Client,
  profile: EtacsCanProfile = ETACS_PROFILES[0]!,
): Promise<EtacsCodingDump> {
  const candidates =
    profile.id === "auto"
      ? ETACS_PROFILES.filter((item) => item.id !== "auto")
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
    `Не удалось выгрузить кодировку ETACS. Включите зажигание (ON) и проверьте, что это Mitsubishi. Ответы: ${errors.join(" | ")}`,
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
