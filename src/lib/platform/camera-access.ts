import { Capacitor } from "@capacitor/core";
import { Camera } from "@capacitor/camera";

export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Request Android/iOS camera permission before WebView getUserMedia. */
export async function ensureCameraPermission(): Promise<boolean> {
  if (!isCapacitorNative()) return true;

  try {
    const current = await Camera.checkPermissions();
    if (current.camera === "granted") return true;

    const requested = await Camera.requestPermissions({ permissions: ["camera"] });
    return requested.camera === "granted";
  } catch {
    return false;
  }
}

type VideoConstraints = MediaTrackConstraints | boolean;

function buildConstraintAttempts(facing: "environment" | "user"): VideoConstraints[] {
  return [
    {
      facingMode: { ideal: facing },
      width: { ideal: 4096 },
      height: { ideal: 3072 },
    },
    { facingMode: { ideal: facing } },
    { facingMode: facing },
    true,
  ];
}

export async function getCameraStream(
  facing: "environment" | "user" = "environment",
): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API unavailable");
  }

  const granted = await ensureCameraPermission();
  if (!granted) {
    throw new Error("Camera permission denied");
  }

  let lastError: unknown;
  for (const video of buildConstraintAttempts(facing)) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Camera unavailable");
}
