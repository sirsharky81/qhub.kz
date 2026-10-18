import type { ObdBleSession } from "./obd-session";
import {
  ETACS_PROFILES,
  type EtacsCanProfile,
  type EtacsCodingDump,
  type EtacsWriteBlockResult,
} from "./mitsubishi-etacs";

export function listMitsubishiEtacsProfiles(): EtacsCanProfile[] {
  return ETACS_PROFILES;
}

export async function downloadMitsubishiEtacsCoding(
  session: ObdBleSession,
  profileId?: string,
): Promise<EtacsCodingDump> {
  return session.readEtacsDump(profileId);
}

export async function uploadMitsubishiEtacsSingleBlock(
  session: ObdBleSession,
  options: {
    profileId?: string;
    kind: "kon" | "cuf";
    payload: Uint8Array;
    overrideLidHex?: string;
  },
): Promise<EtacsWriteBlockResult> {
  return session.writeEtacsBlock(options);
}

