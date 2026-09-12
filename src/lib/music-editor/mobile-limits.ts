import { isIOSDevice, isStandalonePWA } from "@/lib/platform/device";
import { MAX_FILE_SIZE, MAX_TRACKS } from "./types";

/** iOS Safari/PWA has a much lower practical JS heap (~300–500 MB). */
export function isLowMemoryPlatform(): boolean {
  return isIOSDevice();
}

/** Smaller upload cap on iPhone to reduce decode + preview OOM crashes. */
export function getEffectiveMaxFileSize(): number {
  if (isLowMemoryPlatform()) {
    return 30 * 1024 * 1024;
  }
  return MAX_FILE_SIZE;
}

export function getEffectiveMaxTracks(): number {
  if (isLowMemoryPlatform()) {
    return 4;
  }
  return MAX_TRACKS;
}

/** Longer debounce avoids stacking WSOLA renders while dragging sliders on mobile. */
export function getProcessingDebounceMs(): number {
  if (isLowMemoryPlatform()) {
    return isStandalonePWA() ? 500 : 400;
  }
  return 140;
}

/** Cap waveform redraw rate during playback — full canvas redraw at 60 fps is costly on iOS. */
export function getPlaybackRedrawIntervalMs(): number {
  if (isLowMemoryPlatform()) {
    return 1000 / 12;
  }
  return 1000 / 30;
}
