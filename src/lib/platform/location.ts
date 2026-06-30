import type { PlatformResult } from "./types";
import { platformErr, platformOk } from "./types";
import { isNativePlatform } from "./runtime";
import { PlatformLogger } from "./logger";

export interface PlatformCoordinates {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export interface PlatformLocationCallbacks {
  onLocation: (coords: Omit<PlatformCoordinates, "timestamp"> & { timestamp?: number }) => void;
  onError: (error: Error) => void;
}

let backgroundStop: (() => void) | null = null;
let resumeListener: (() => void) | null = null;
const watchStops = new Map<string, () => void>();

export const PlatformLocation = {
  async requestPermission(): Promise<"granted" | "denied" | "prompt"> {
    if (typeof navigator === "undefined" || !navigator.geolocation) return "denied";
    if (typeof navigator.permissions?.query === "function") {
      try {
        const status = await navigator.permissions.query({ name: "geolocation" });
        if (status.state === "granted") return "granted";
        if (status.state === "denied") return "denied";
      } catch {
        /* ignore */
      }
    }
    return "prompt";
  },

  async getCurrentPosition(): Promise<PlatformResult<PlatformCoordinates>> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return platformErr("NotSupportedOnPlatform", "Geolocation unavailable");
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve(
            platformOk({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp,
            }),
          ),
        (err) => resolve(platformErr("GPSUnavailable", err.message)),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
      );
    });
  },

  async watch(callbacks: PlatformLocationCallbacks): Promise<string> {
    const { startGeoWatch } = await import("@/lib/family/geo");
    const stop = startGeoWatch((coords) => {
      callbacks.onLocation({ ...coords, timestamp: Date.now() });
    });
    const id = `watch-${Date.now()}`;
    watchStops.set(id, stop);
    return id;
  },

  async clearWatch(watcherId: string): Promise<void> {
    watchStops.get(watcherId)?.();
    watchStops.delete(watcherId);
  },

  async startBackgroundTracking(callbacks: PlatformLocationCallbacks): Promise<PlatformResult<void>> {
    if (!isNativePlatform()) {
      PlatformLogger.warn("Background tracking unavailable on web — using foreground watch");
      await PlatformLocation.watch(callbacks);
      return platformOk(undefined);
    }

    try {
      const { BackgroundGeolocationNative } = await import(
        "@/lib/platform/native/background-geolocation"
      );
      await BackgroundGeolocationNative.start(callbacks);
      await PlatformLocation.setupResumeRestart(callbacks);
      return platformOk(undefined);
    } catch (e) {
      return platformErr("NotSupportedOnPlatform", String(e));
    }
  },

  async stopBackgroundTracking(): Promise<void> {
    backgroundStop?.();
    backgroundStop = null;
    resumeListener?.();
    resumeListener = null;
    if (isNativePlatform()) {
      try {
        const { BackgroundGeolocationNative } = await import(
          "@/lib/platform/native/background-geolocation"
        );
        await BackgroundGeolocationNative.stop();
      } catch {
        /* ignore */
      }
    }
  },

  async setupResumeRestart(callbacks: PlatformLocationCallbacks): Promise<void> {
    if (!isNativePlatform()) return;
    try {
      const { App } = await import("@capacitor/app");
      resumeListener?.();
      const handle = await App.addListener("resume", async () => {
        PlatformLogger.info("App resumed — verifying background tracking");
        const { BackgroundGeolocationNative } = await import(
          "@/lib/platform/native/background-geolocation"
        );
        await BackgroundGeolocationNative.ensureRunning(callbacks);
      });
      resumeListener = () => handle.remove();
    } catch {
      /* App plugin not available */
    }
  },
};
