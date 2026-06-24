import { GEO_HIDDEN_MS, GEO_VISIBLE_MS } from "./constants";

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

export type GeoWatchCallback = (position: GeoPosition) => void;

export function getCurrentPosition(): Promise<GeoPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("geolocation_unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  });
}

export function startGeoWatch(onUpdate: GeoWatchCallback): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return () => {};
  }

  let watchId: number | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const poll = () => {
    void getCurrentPosition()
      .then(onUpdate)
      .catch(() => {});
  };

  const startWatch = () => {
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
    }

    const ms = document.hidden ? GEO_HIDDEN_MS : GEO_VISIBLE_MS;
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        onUpdate({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: ms / 2, timeout: 20000 },
    );
    intervalId = setInterval(poll, ms);
    poll();
  };

  const onVisibility = () => startWatch();
  document.addEventListener("visibilitychange", onVisibility);
  startWatch();

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    if (intervalId != null) clearInterval(intervalId);
  };
}
