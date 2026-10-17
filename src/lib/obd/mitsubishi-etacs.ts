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
    label: "Автопоиск ETACS (7A1 / 710 / 620, KWP 21 и UDS 22)",
    txId: 0x7a1,
    rxId: 0x7a0,
    service: 0x21,
    variantId: [0x30],
    customId: [0x31],
    partId: [0x80],
  },
  {
    id: "7a1-7a0",
    label: "ETACS 7A1 → 7A0 · KWP 21 (Pajero Sport, Outlander XL/III, ASX, Lancer X)",
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
    id: "620-504",
    label: "ETACS 620 → 504 · KWP 21 (часть кузовов Mitsubishi)",
    txId: 0x620,
    rxId: 0x504,
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
  const standardPair = profile.rxId === ((profile.txId + 8) & 0x7ff);
  if (standardPair) {
    await elm.clearRxFilter();
    await elm.setCanHeader(profile.txId);
  } else {
    await elm.setCanHeader(profile.txId, profile.rxId);
  }
  // Open extended diagnostic session (KWP 10 92 / UDS 10 03) so coding LIDs are unlocked for reading.
  try {
    await elm.sendPayload(profile.service === 0x21 ? "1092" : "1003", 3_000);
  } catch {
    /* some ETACS units answer in default session */
  }
  try {
    await elm.sendPayload("1003", 3_000);
    await elm.sendPayload("3E00", 2_500);
  } catch {
    /* optional */
  }
}

async function readCodingBlock(
  elm: Elm327Client,
  profile: EtacsCanProfile,
  identifier: number[],
): Promise<{ payload: Uint8Array; raw: string }> {
  const idHex = identifier.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
  const svcHex = profile.service.toString(16).padStart(2, "0").toUpperCase();
  const raw = await elm.sendPayload(`${svcHex}${idHex}`, 12_000);
  const payload = positiveEtacsPayload(raw, profile.service, identifier);
  if (!payload || payload.length === 0) {
    const compact = raw.replace(/>/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "NO DATA";
    throw new Error(
      `ETACS не отдал блок ${svcHex} ${idHex} (${compact}) на адресе ${profile.txId.toString(16).toUpperCase()}/${profile.rxId.toString(16).toUpperCase()}.`,
    );
  }
  return { payload, raw };
}

async function tryReadPartNumber(elm: Elm327Client, profile: EtacsCanProfile): Promise<string | null> {
  if (!profile.partId) return null;
  try {
    const idHex = profile.partId.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join("");
    const svcHex = profile.service.toString(16).padStart(2, "0").toUpperCase();
    const raw = await elm.sendPayload(`${svcHex}${idHex}`, 3_500);
    const payload = positiveEtacsPayload(raw, profile.service, profile.partId);
    if (!payload) return null;
    const ascii = Array.from(payload)
      .filter((b) => b >= 0x20 && b <= 0x7e)
      .map((b) => String.fromCharCode(b))
      .join("")
      .trim();
    return ascii.length >= 4 ? ascii : bytesToHex(payload);
  } catch {
    return null;
  }
}

async function readSingleEtacsProfile(
  elm: Elm327Client,
  profile: EtacsCanProfile,
): Promise<EtacsCodingDump> {
  await configureEtacsChannel(elm, profile);
  const variant = await readCodingBlock(elm, profile, profile.variantId);
  const custom = await readCodingBlock(elm, profile, profile.customId);
  const partNumber = await tryReadPartNumber(elm, profile);
  return {
    profileId: profile.id,
    profileLabel: profile.label,
    txHex: profile.txId.toString(16).toUpperCase(),
    rxHex: profile.rxId.toString(16).toUpperCase(),
    partNumber,
    variant: variant.payload,
    custom: custom.payload,
    rawVariantResponse: variant.raw,
    rawCustomResponse: custom.raw,
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
