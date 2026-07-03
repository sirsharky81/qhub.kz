import { postLocationApi } from "./client";
import { readBatteryLevel } from "./battery";
import { loadChildSession } from "./session";
import type { GeoPosition } from "./geo";

/** Post child coordinates with session auth (direct or offline queue). */
export async function submitChildLocation(pos: GeoPosition): Promise<void> {
  const session = loadChildSession();
  if (!session) return;
  const battery = await readBatteryLevel();
  await postLocationApi(session, {
    lat: pos.lat,
    lng: pos.lng,
    accuracy: pos.accuracy,
    battery,
  });
}
