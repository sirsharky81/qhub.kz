export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true
  );
}

export function supportsAudioWorklet(): boolean {
  if (typeof AudioContext === "undefined") return false;
  return "audioWorklet" in AudioContext.prototype;
}

export function getAppVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "0.1.0";
}

export async function getDeviceInfo(): Promise<{
  platform: string;
  manufacturer?: string;
  model?: string;
  appVersion: string;
}> {
  const { isNativePlatform, getNativePlatform } = await import("./runtime");
  if (!isNativePlatform()) {
    return { platform: "web", appVersion: getAppVersion() };
  }
  try {
    const { Device } = await import("@capacitor/device");
    const info = await Device.getInfo();
    return {
      platform: getNativePlatform(),
      manufacturer: info.manufacturer,
      model: info.model,
      appVersion: getAppVersion(),
    };
  } catch {
    return { platform: getNativePlatform(), appVersion: getAppVersion() };
  }
}
