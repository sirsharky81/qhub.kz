import type { ObdBleSession } from "./obd-session";
import {
  ETACS_PROFILES,
  type EtacsCanProfile,
  type EtacsCodingDump,
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
