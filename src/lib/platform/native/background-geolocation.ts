import { registerPlugin } from "@capacitor/core";
import type {
  BackgroundGeolocationPlugin,
  CallbackError,
  Location,
} from "@capacitor-community/background-geolocation";
import type { PlatformLocationCallbacks } from "../location";
import { PlatformLogger } from "../logger";

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  "BackgroundGeolocation",
);

export interface TrackLocationSample {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp?: number;
  ele?: number;
}

export interface TrackLocationCallbacks {
  onLocation: (coords: TrackLocationSample) => void;
  onError: (error: Error) => void;
}

let familyRunning = false;
let familyStopFn: (() => void) | null = null;
let trackStopFn: (() => void) | null = null;

function locationToCoords(location: Location): TrackLocationSample {
  return {
    lat: location.latitude,
    lng: location.longitude,
    accuracy: location.accuracy ?? 0,
    timestamp: location.time ?? Date.now(),
    ele:
      location.altitude != null && Number.isFinite(location.altitude)
        ? location.altitude
        : undefined,
  };
}

export const BackgroundGeolocationNative = {
  async start(callbacks: PlatformLocationCallbacks): Promise<void> {
    return BackgroundGeolocationNative.startFamily(callbacks);
  },

  async startFamily(callbacks: PlatformLocationCallbacks): Promise<void> {
    if (familyStopFn) {
      familyStopFn();
      familyStopFn = null;
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
        callbacks.onLocation({
          lat: location.latitude,
          lng: location.longitude,
          accuracy: location.accuracy ?? 0,
        });
      },
    );

    familyRunning = true;
    familyStopFn = () => {
      void BackgroundGeolocation.removeWatcher({ id: watcherId });
    };
    PlatformLogger.info("Background geolocation started (family)");
  },

  async startTrack(callbacks: TrackLocationCallbacks): Promise<void> {
    if (trackStopFn) {
      trackStopFn();
      trackStopFn = null;
    }

    const watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: "QHub записывает GPS-трек. Экран можно выключить.",
        backgroundTitle: "QHub — запись трека",
        requestPermissions: true,
        stale: false,
        distanceFilter: 5,
      },
      (location?: Location, error?: CallbackError) => {
        if (error) {
          callbacks.onError(new Error(error.message ?? "Background geolocation error"));
          return;
        }
        if (!location) return;
        callbacks.onLocation(locationToCoords(location));
      },
    );

    trackStopFn = () => {
      void BackgroundGeolocation.removeWatcher({ id: watcherId });
    };
    PlatformLogger.info("Background geolocation started (track)");
  },

  async stop(): Promise<void> {
    await BackgroundGeolocationNative.stopFamily();
  },

  async stopFamily(): Promise<void> {
    familyStopFn?.();
    familyStopFn = null;
    familyRunning = false;
  },

  async stopTrack(): Promise<void> {
    trackStopFn?.();
    trackStopFn = null;
  },

  async ensureRunning(callbacks: PlatformLocationCallbacks): Promise<void> {
    if (!familyRunning) {
      await BackgroundGeolocationNative.startFamily(callbacks);
    }
  },
};
