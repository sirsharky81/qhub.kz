import { extractHexTokens } from "./hex";
import type { Elm327Client } from "./elm327";

export interface EtacsCanProfile {
  id: string;
  label: string;
  txId: number;
  rxId: number;
  /** KWP ReadDataByLocalIdentifier — variant (MMCodingWriter / MUT). */
  variantLid: number;
  /** Custom coding. */
  customLid: number;
}

/** Common Mitsubishi ETACS addressing; confirm on your model if read fails. */
export const ETACS_PROFILES: EtacsCanProfile[] = [
  {
    id: "7a1-7a0",
    label: "ETACS 7A1 / 7A0 (i-MiEV, часть моделей)",
    txId: 0x7a1,
    rxId: 0x7a0,
    variantLid: 0x30,
    customLid: 0x31,
  },
  {
    id: "710-718",
    label: "ETACS 710 / 718 (альтернативный адрес)",
    txId: 0x710,
    rxId: 0x718,
    variantLid: 0x30,
    customLid: 0x31,
  },
];

export interface EtacsCodingDump {
  profileId: string;
  variant: Uint8Array;
  custom: Uint8Array;
  rawVariantResponse: string;
  rawCustomResponse: string;
}

function positiveResponsePayload(raw: string, _rxId: number, service: number, lid: number): Uint8Array | null {
  const bytes = extractHexTokens(raw);
  const expectSid = service + 0x40;

  for (let i = 0; i + 1 < bytes.length; i++) {
    if (bytes[i] === expectSid && bytes[i + 1] === lid) {
      const data = bytes.slice(i + 2);
      if (data.length > 0) return Uint8Array.from(data);
    }
  }
  return null;
}

async function kwpReadByLid(
  elm: Elm327Client,
  profile: EtacsCanProfile,
  lid: number,
): Promise<{ payload: Uint8Array; raw: string }> {
  await elm.setCanHeader(profile.txId, profile.rxId);
  try {
    await elm.sendCommand("ATCAF0");
  } catch {
    /* optional */
  }
  try {
    await elm.sendPayload("1003");
    await elm.sendPayload("3E00");
  } catch {
    /* session optional on some ECUs */
  }

  const lidHex = lid.toString(16).padStart(2, "0").toUpperCase();
  const raw = await elm.sendPayload(`21${lidHex}`, 15_000);
  const payload = positiveResponsePayload(raw, profile.rxId, 0x21, lid);
  if (!payload || payload.length === 0) {
    throw new Error(
      `Пустой ответ ETACS (LID ${lidHex}). Проверьте профиль CAN ${profile.label} и зажигание.`,
    );
  }
  return { payload, raw };
}

export async function readEtacsCoding(
  elm: Elm327Client,
  profile: EtacsCanProfile = ETACS_PROFILES[0]!,
): Promise<EtacsCodingDump> {
  const variant = await kwpReadByLid(elm, profile, profile.variantLid);
  const custom = await kwpReadByLid(elm, profile, profile.customLid);
  return {
    profileId: profile.id,
    variant: variant.payload,
    custom: custom.payload,
    rawVariantResponse: variant.raw,
    rawCustomResponse: custom.raw,
  };
}

/** MMCodingWriter-style filenames (binary payload). */
export function etacsDownloadNames(prefix: string): { variant: string; custom: string } {
  const safe = prefix.replace(/[^\w\-]+/g, "_").slice(0, 40);
  return {
    variant: `${safe}_variant.con`,
    custom: `${safe}_custom.cuf`,
  };
}
