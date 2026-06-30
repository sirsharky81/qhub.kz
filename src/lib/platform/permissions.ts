import type { PlatformResult } from "./types";
import { platformErr, platformOk } from "./types";
import { isNativePlatform } from "./runtime";

export type PermissionType =
  | "camera"
  | "photos"
  | "microphone"
  | "notifications"
  | "location"
  | "locationBackground"
  | "files";

export const PlatformPermissions = {
  async check(type: PermissionType): Promise<"granted" | "denied" | "prompt"> {
    if (type === "notifications" && typeof Notification !== "undefined") {
      if (Notification.permission === "granted") return "granted";
      if (Notification.permission === "denied") return "denied";
      return "prompt";
    }
    if (type === "location" || type === "locationBackground") {
      if (typeof navigator !== "undefined" && navigator.permissions?.query) {
        try {
          const s = await navigator.permissions.query({ name: "geolocation" });
          if (s.state === "granted") return "granted";
          if (s.state === "denied") return "denied";
        } catch {
          /* ignore */
        }
      }
      return "prompt";
    }
    return "prompt";
  },

  async request(type: PermissionType): Promise<"granted" | "denied"> {
    if (isNativePlatform()) {
      return requestNativePermission(type);
    }
    if (type === "notifications" && typeof Notification !== "undefined") {
      const r = await Notification.requestPermission();
      return r === "granted" ? "granted" : "denied";
    }
    if (type === "location" || type === "locationBackground") {
      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve("denied");
          return;
        }
        navigator.geolocation.getCurrentPosition(
          () => resolve("granted"),
          () => resolve("denied"),
          { timeout: 15000 },
        );
      });
    }
    return "denied";
  },

  async openSettings(): Promise<PlatformResult<void>> {
    if (!isNativePlatform()) {
      return platformErr("NotSupportedOnPlatform", "Settings open is native-only");
    }
    try {
      const { registerPlugin } = await import("@capacitor/core");
      const BackgroundGeolocation = registerPlugin<{ openSettings: () => Promise<void> }>(
        "BackgroundGeolocation",
      );
      await BackgroundGeolocation.openSettings();
      return platformOk(undefined);
    } catch {
      return platformErr("NotSupportedOnPlatform", "Native settings unavailable");
    }
  },
};

async function requestNativePermission(type: PermissionType): Promise<"granted" | "denied"> {
  try {
    if (type === "notifications") {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const r = await PushNotifications.requestPermissions();
      return r.receive === "granted" ? "granted" : "denied";
    }
    if (type === "location" || type === "locationBackground") {
      const { Geolocation } = await import("@capacitor/geolocation");
      const r = await Geolocation.requestPermissions();
      if (type === "locationBackground") {
        return r.location === "granted" ? "granted" : "denied";
      }
      return r.location === "granted" ? "granted" : "denied";
    }
    if (type === "camera" || type === "photos") {
      const { Camera } = await import("@capacitor/camera");
      const r = await Camera.requestPermissions({ permissions: ["camera", "photos"] });
      if (type === "camera") {
        return r.camera === "granted" || r.camera === "limited" ? "granted" : "denied";
      }
      return r.photos === "granted" || r.photos === "limited" ? "granted" : "denied";
    }
    if (type === "microphone") {
      // WebView getUserMedia triggers RECORD_AUDIO via BridgeWebChromeClient after manifest declaration.
      // Probe with a minimal stream to surface the system dialog.
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          stream.getTracks().forEach((t) => t.stop());
          return "granted";
        } catch {
          return "denied";
        }
      }
      return "denied";
    }
  } catch {
    return "denied";
  }
  return "denied";
}
