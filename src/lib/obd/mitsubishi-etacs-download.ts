import type { ObdBleSession } from "./obd-session";
import {
  ETACS_PROFILES,
  readEtacsCoding,
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
  if (session.phase !== "vehicle") {
    throw new Error("Сначала подключитесь к автомобилю (OBD)");
  }
  const elm = session.getElm();
  if (!elm) throw new Error("Адаптер не инициализирован");
  const profile = ETACS_PROFILES.find((p) => p.id === profileId) ?? ETACS_PROFILES[0]!;
  return readEtacsCoding(elm, profile);
}
