import { registerPlugin } from "@capacitor/core";
import { getNativePlatform, isNativePlatform } from "../runtime";

interface QHubAppPlugin {
  getNativeCapabilities(): Promise<{ pushConfigured: boolean }>;
}

const QHubApp = registerPlugin<QHubAppPlugin>("QHubApp", {
  web: () =>
    import("./app-capabilities.web").then((m) => ({
      getNativeCapabilities: async () => ({ pushConfigured: await m.isNativePushConfigured() }),
    })),
});

let cachedPushConfigured: boolean | null = null;

/** Whether FCM is configured in the Android build (google-services.json present). */
export async function isNativePushConfigured(): Promise<boolean> {
  if (!isNativePlatform() || getNativePlatform() !== "android") {
    return true;
  }
  if (cachedPushConfigured !== null) return cachedPushConfigured;
  try {
    const caps = await QHubApp.getNativeCapabilities();
    cachedPushConfigured = caps.pushConfigured;
    return caps.pushConfigured;
  } catch {
    cachedPushConfigured = false;
    return false;
  }
}
