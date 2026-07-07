import { getCurrentPosition } from "./geo";
import { submitChildLocation } from "./child-location";
import { PlatformLocation } from "@/lib/platform/location";
import { isNativePlatform } from "@/lib/platform/runtime";

export interface FamilyLocatePushData {
  action?: string;
  requestId?: string;
}

export async function handleFamilyLocatePush(data: FamilyLocatePushData): Promise<boolean> {
  if (data.action !== "family:locate") return false;

  let pos: { lat: number; lng: number; accuracy: number };
  if (isNativePlatform()) {
    const result = await PlatformLocation.getCurrentPosition();
    if (!result.ok) return false;
    pos = {
      lat: result.value.lat,
      lng: result.value.lng,
      accuracy: result.value.accuracy,
    };
  } else {
    try {
      pos = await getCurrentPosition();
    } catch {
      return false;
    }
  }

  await submitChildLocation(pos);
  return true;
}
