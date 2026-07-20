import { describe, expect, it } from "vitest";
import {
  shouldAcceptTrackPoint,
  TRACK_MAX_INTERVAL_MS,
  type TrackRecordingSample,
} from "./track-recording";
import type { TrackPoint } from "./gpx";

describe("shouldAcceptTrackPoint", () => {
  const base: TrackRecordingSample = {
    lat: 43.1,
    lng: 76.9,
    ts: 1_000_000,
    accuracy: 10,
  };

  it("accepts the first point", () => {
    expect(shouldAcceptTrackPoint(null, base)).toBe(true);
  });

  it("rejects poor accuracy", () => {
    expect(shouldAcceptTrackPoint(null, { ...base, accuracy: 50 })).toBe(false);
  });

  it("accepts after max interval even without movement", () => {
    const prev: TrackPoint = { lat: 43.1, lng: 76.9, ts: base.ts - TRACK_MAX_INTERVAL_MS };
    expect(shouldAcceptTrackPoint(prev, base)).toBe(true);
  });

  it("accepts elevation-only change on steep climb", () => {
    const prev: TrackPoint = { lat: 43.1, lng: 76.9, ts: base.ts - 1000, ele: 1000 };
    expect(
      shouldAcceptTrackPoint(prev, {
        ...base,
        ts: base.ts,
        ele: 1005,
      }),
    ).toBe(true);
  });
});
