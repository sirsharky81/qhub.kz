import { registerPlugin } from "@capacitor/core";
import type {
  BackgroundGeolocationPlugin,
  CallbackError,
  Location,
} from "@capacitor-community/background-geolocation";
import type { PlatformLocationCallbacks } from "../location";
import { PlatformOfflineQueue } from "../offlineQueue";
import { PlatformLogger } from "../logger";

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation",
);

let running = false;
let stopFn: (() => void) | null = null;

async function onCoordinate(coords: { lat: number; lng: number; accuracy: number }): Promise<void> {
  await PlatformOfflineQueue.enqueue({
    type: "location",
    endpoint: "/api/family/location",
    payload: {
      lat: coords.lat,
      lng: coords.lng,
      accuracy: coords.accuracy,
      battery: null,
    },
  });
}

export const BackgroundGeolocationNative = {
  async start(callbacks: PlatformLocationCallbacks): Promise<void> {
    if (stopFn) {
      stopFn();
      stopFn = null;
    }

    const watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: "QHub отслеживает местоположение для безопасности семьи",
        backgroundTitle: "QHub — геолокация активна",
        requestPermissions: true,
        stale: false,
        distanceFilter: 100,
      },
      (location?: Location, error?: CallbackError) => {
        if (error) {
          callbacks.onError(new Error(error.message ?? "Background geolocation error"));
          return;
        }
        if (!location) return;
        const coords = {
          lat: location.latitude,
          lng: location.longitude,
          accuracy: location.accuracy ?? 0,
        };
        callbacks.onLocation(coords);
        void onCoordinate(coords);
      },
    );

    running = true;
    stopFn = () => {
      void BackgroundGeolocation.removeWatcher({ id: watcherId });
    };
    PlatformLogger.info("Background geolocation started");
  },

  async stop(): Promise<void> {
    stopFn?.();
    stopFn = null;
    running = false;
  },

  async ensureRunning(callbacks: PlatformLocationCallbacks): Promise<void> {
    if (!running) {
      await BackgroundGeolocationNative.start(callbacks);
    }
  },
};
