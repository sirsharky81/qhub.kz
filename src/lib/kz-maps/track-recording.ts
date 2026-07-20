import { isIOS, isStandalone } from "@/lib/pwa-utils";
import { PlatformFeatures } from "@/lib/platform/features";
import { isNativePlatform } from "@/lib/platform/runtime";
import type { TrackPoint } from "./gpx";
import {
  appendRecordingBuffer,
  clearRecordingBuffer,
  readRecordingBuffer,
} from "./track-recording-buffer";

/** Minimum horizontal movement before accepting a point (metres). */
export const TRACK_MIN_HORIZONTAL_M = 5;
/** Minimum elevation change before accepting a point (metres). */
export const TRACK_MIN_ELEVATION_M = 4;
/** Accept a point at least this often even without movement (ms). */
export const TRACK_MAX_INTERVAL_MS = 12_000;
/** Ignore fixes worse than this (metres). */
export const TRACK_MAX_ACCURACY_M = 35;

const TRACK_VISIBLE_POLL_MS = 10_000;
const TRACK_HIDDEN_POLL_MS = 15_000;

export type TrackRecordingMode = "native-background" | "foreground" | "limited-pwa";

export interface TrackRecordingCapabilities {
  mode: TrackRecordingMode;
  label: string;
  warning?: string;
}

export interface TrackRecordingSample {
  lat: number;
  lng: number;
  ts: number;
  accuracy: number;
  ele?: number;
}

export interface StartTrackRecordingOptions {
  onPoint: (point: TrackPoint, total: number) => void;
  onError?: (message: string) => void;
}

function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function lastBufferedPoint(): TrackPoint | null {
  const buf = readRecordingBuffer();
  return buf.length > 0 ? buf[buf.length - 1]! : null;
}

export function shouldAcceptTrackPoint(
  prev: TrackPoint | null,
  sample: TrackRecordingSample,
): boolean {
  if (!Number.isFinite(sample.lat) || !Number.isFinite(sample.lng)) return false;
  if (sample.accuracy > TRACK_MAX_ACCURACY_M) return false;
  if (!prev) return true;

  const elapsed = sample.ts - prev.ts;
  if (elapsed >= TRACK_MAX_INTERVAL_MS) return true;
  if (haversineM(prev, sample) >= TRACK_MIN_HORIZONTAL_M) return true;

  if (
    prev.ele != null &&
    sample.ele != null &&
    Math.abs(sample.ele - prev.ele) >= TRACK_MIN_ELEVATION_M
  ) {
    return true;
  }

  return false;
}

function ingestSample(
  sample: TrackRecordingSample,
  onPoint: StartTrackRecordingOptions["onPoint"],
): void {
  const prev = lastBufferedPoint();
  if (!shouldAcceptTrackPoint(prev, sample)) return;

  const point: TrackPoint = {
    lat: sample.lat,
    lng: sample.lng,
    ts: sample.ts,
    ...(sample.ele != null && Number.isFinite(sample.ele) ? { ele: sample.ele } : {}),
  };
  const total = appendRecordingBuffer(point);
  onPoint(point, total.length);
}

export function getTrackRecordingCapabilities(): TrackRecordingCapabilities {
  if (isNativePlatform() && PlatformFeatures.locationBackground) {
    return {
      mode: "native-background",
      label: "Фоновый GPS (приложение)",
    };
  }

  if (isIOS() && isStandalone()) {
    return {
      mode: "limited-pwa",
      label: "PWA — только при активном экране",
      warning:
        "На iPhone PWA запись в кармане с выключенным экраном недоступна. Держите QHub на экране или установите приложение QHub из App Store.",
    };
  }

  if (isIOS()) {
    return {
      mode: "limited-pwa",
      label: "Safari — только при активном экране",
      warning:
        "В Safari запись в кармане с выключенным экраном недоступна. Установите PWA «На экран Домой» и держите приложение активным, либо используйте QHub из App Store.",
    };
  }

  if (isNativePlatform()) {
    return {
      mode: "foreground",
      label: "Приложение — GPS на экране",
    };
  }

  return {
    mode: "foreground",
    label: "Браузер — GPS на экране",
    warning:
      "В браузере запись в кармане может прерываться. Для надёжной записи на подъёме используйте приложение QHub.",
  };
}

function startForegroundTrackWatch(options: StartTrackRecordingOptions): () => TrackPoint[] {
  let watchId: number | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let cancelled = false;

  const poll = () => {
    if (cancelled || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        ingestSample(
          {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ts: pos.timestamp || Date.now(),
            accuracy: pos.coords.accuracy,
            ele:
              pos.coords.altitude != null && Number.isFinite(pos.coords.altitude)
                ? pos.coords.altitude
                : undefined,
          },
          options.onPoint,
        );
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
  };

  const restart = () => {
    if (cancelled || typeof navigator === "undefined" || !navigator.geolocation) return;

    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
    }

    const ms =
      typeof document !== "undefined" && document.hidden
        ? TRACK_HIDDEN_POLL_MS
        : TRACK_VISIBLE_POLL_MS;

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        ingestSample(
          {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ts: pos.timestamp || Date.now(),
            accuracy: pos.coords.accuracy,
            ele:
              pos.coords.altitude != null && Number.isFinite(pos.coords.altitude)
                ? pos.coords.altitude
                : undefined,
          },
          options.onPoint,
        );
      },
      (err) => {
        options.onError?.(err.message || "Ошибка GPS");
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );

    intervalId = setInterval(poll, ms);
    poll();
  };

  const onVisibility = () => restart();
  document.addEventListener("visibilitychange", onVisibility);
  restart();

  return () => {
    cancelled = true;
    document.removeEventListener("visibilitychange", onVisibility);
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    if (intervalId != null) clearInterval(intervalId);
    return readRecordingBuffer();
  };
}

async function startNativeBackgroundTrackWatch(
  options: StartTrackRecordingOptions,
): Promise<() => TrackPoint[]> {
  const { BackgroundGeolocationNative } = await import(
    "@/lib/platform/native/background-geolocation"
  );

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let cancelled = false;

  await BackgroundGeolocationNative.startTrack({
    onLocation: (coords) => {
      ingestSample(
        {
          lat: coords.lat,
          lng: coords.lng,
          ts: coords.timestamp ?? Date.now(),
          accuracy: coords.accuracy,
          ele: coords.ele,
        },
        options.onPoint,
      );
    },
    onError: (err) => options.onError?.(err.message),
  });

  const poll = () => {
    if (cancelled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        ingestSample(
          {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ts: pos.timestamp || Date.now(),
            accuracy: pos.coords.accuracy,
            ele:
              pos.coords.altitude != null && Number.isFinite(pos.coords.altitude)
                ? pos.coords.altitude
                : undefined,
          },
          options.onPoint,
        );
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
  };

  intervalId = setInterval(poll, TRACK_MAX_INTERVAL_MS);
  poll();

  return () => {
    cancelled = true;
    if (intervalId != null) clearInterval(intervalId);
    void BackgroundGeolocationNative.stopTrack();
    return readRecordingBuffer();
  };
}

/**
 * Start GPS track recording. Returns a stop function that flushes buffered points.
 */
export function startTrackRecording(options: StartTrackRecordingOptions): () => TrackPoint[] {
  clearRecordingBuffer();

  const caps = getTrackRecordingCapabilities();
  const session: { stop: (() => TrackPoint[]) | null } = { stop: null };

  if (caps.mode === "native-background") {
    void startNativeBackgroundTrackWatch(options)
      .then((stop) => {
        session.stop = stop;
      })
      .catch((e) => {
        options.onError?.(
          e instanceof Error ? e.message : "Не удалось запустить фоновый GPS",
        );
        session.stop = startForegroundTrackWatch(options);
      });

    return () => {
      if (session.stop) return session.stop();
      return readRecordingBuffer();
    };
  }

  session.stop = startForegroundTrackWatch(options);
  return () => session.stop?.() ?? readRecordingBuffer();
}
