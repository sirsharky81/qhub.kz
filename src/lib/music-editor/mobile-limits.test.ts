import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getEffectiveMaxFileSize,
  getEffectiveMaxTracks,
  getPlaybackRedrawIntervalMs,
  getProcessingDebounceMs,
} from "./mobile-limits";
import { MAX_FILE_SIZE, MAX_TRACKS } from "./types";

vi.mock("@/lib/platform/device", () => ({
  isIOSDevice: vi.fn(() => false),
  isStandalonePWA: vi.fn(() => false),
}));

describe("mobile-limits", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses desktop defaults on non-iOS", async () => {
    const { isIOSDevice } = await import("@/lib/platform/device");
    vi.mocked(isIOSDevice).mockReturnValue(false);

    expect(getEffectiveMaxFileSize()).toBe(MAX_FILE_SIZE);
    expect(getEffectiveMaxTracks()).toBe(MAX_TRACKS);
    expect(getProcessingDebounceMs()).toBe(140);
    expect(getPlaybackRedrawIntervalMs()).toBeCloseTo(1000 / 30);
  });

  it("tightens limits on iOS", async () => {
    const { isIOSDevice, isStandalonePWA } = await import("@/lib/platform/device");
    vi.mocked(isIOSDevice).mockReturnValue(true);
    vi.mocked(isStandalonePWA).mockReturnValue(true);

    expect(getEffectiveMaxFileSize()).toBe(30 * 1024 * 1024);
    expect(getEffectiveMaxTracks()).toBe(4);
    expect(getProcessingDebounceMs()).toBe(500);
    expect(getPlaybackRedrawIntervalMs()).toBeCloseTo(1000 / 12);
  });
});
