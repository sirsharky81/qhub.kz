import { describe, expect, it } from "vitest";
import { applyEq } from "./eq";
import {
  createManualSettings,
  FLAT_EQ,
  playbackRateFromBpm,
  bpmFromPlaybackRate,
} from "./types";
import {
  computeResultDuration,
  getTimedSegments,
  mapResultTimeToSource,
  mapResumeResultTime,
  mapSourceTimeToResult,
  upsertEditRegion,
} from "./selection";
import { timeStretch, timeStretchPlanar } from "./time-stretch";

function sine(freq: number, sampleRate: number, length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

function rms(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / Math.max(1, data.length));
}

describe("timeStretch", () => {
  it("keeps length at rate 1", () => {
    const input = sine(440, 44100, 44100);
    const out = timeStretch(input, 1);
    expect(out.length).toBe(input.length);
  });

  it("halves length at rate 2", () => {
    const input = sine(220, 44100, 44100);
    const out = timeStretch(input, 2);
    expect(out.length / input.length).toBeCloseTo(0.5, 1);
  });

  it("doubles length at rate 0.5", () => {
    const input = sine(220, 44100, 22050);
    const out = timeStretch(input, 0.5);
    expect(out.length / input.length).toBeCloseTo(2, 1);
  });

  it("does not leave a silent tail at a small rate change", () => {
    const input = sine(220, 44100, 44100);
    const out = timeStretch(input, 1.05, 44100);
    const last = out.subarray(Math.floor(out.length * 0.9));
    expect(rms(last)).toBeGreaterThan(0.2);
  });

  it("keeps stereo channels distinct", () => {
    const left = sine(220, 44100, 44100);
    const right = sine(550, 44100, 44100);
    const [outL, outR] = timeStretchPlanar([left, right], 1.1, 44100);
    expect(outL.length).toBe(outR.length);
    let diff = 0;
    for (let i = 0; i < outL.length; i++) diff += (outL[i] - outR[i]) ** 2;
    expect(Math.sqrt(diff / outL.length)).toBeGreaterThan(0.2);
  });
});

describe("timed segments and mapping", () => {
  it("applies global rate to duration", () => {
    const settings = createManualSettings();
    settings.playbackRate = 2;
    expect(computeResultDuration(10, settings)).toBeCloseTo(5, 5);
  });

  it("splits keep range by edit region", () => {
    const settings = createManualSettings();
    settings.editRegions = [
      {
        start: 2,
        end: 4,
        playbackRate: 2,
        volume: 1,
        eq: { ...FLAT_EQ },
      },
    ];
    const segs = getTimedSegments(10, settings);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toMatchObject({ start: 0, end: 2, rate: 1 });
    expect(segs[1]).toMatchObject({ start: 2, end: 4, rate: 2 });
    expect(segs[2]).toMatchObject({ start: 4, end: 10, rate: 1 });
    expect(computeResultDuration(10, settings)).toBeCloseTo(9, 5);
  });

  it("maps source and result time reversibly at region bounds", () => {
    const settings = createManualSettings();
    settings.editRegions = [
      {
        start: 2,
        end: 4,
        playbackRate: 2,
        volume: 1,
        eq: { ...FLAT_EQ },
      },
    ];
    const points = [0, 2, 3, 4, 10];
    for (const src of points) {
      const result = mapSourceTimeToResult(src, 10, settings);
      const back = mapResultTimeToSource(result, 10, settings);
      expect(back).toBeCloseTo(src, 3);
    }
  });

  it("keeps the same source position when speed changes", () => {
    const before = createManualSettings();
    const after = createManualSettings();
    after.playbackRate = 2;
    expect(mapResumeResultTime(5, 10, before, after)).toBeCloseTo(2.5, 5);
    expect(mapResumeResultTime(2.5, 10, after, before)).toBeCloseTo(5, 5);
  });

  it("splits overlapping regions on upsert", () => {
    const first = upsertEditRegion(
      [],
      { start: 0, end: 10, playbackRate: 1.1, volume: 1, eq: { ...FLAT_EQ } },
    );
    const next = upsertEditRegion(first, {
      start: 3,
      end: 6,
      playbackRate: 1.25,
      volume: 0.8,
      eq: { ...FLAT_EQ },
    });
    expect(next).toHaveLength(3);
    expect(next[0]).toMatchObject({ start: 0, end: 3, playbackRate: 1.1 });
    expect(next[1]).toMatchObject({ start: 3, end: 6, playbackRate: 1.25, volume: 0.8 });
    expect(next[2]).toMatchObject({ start: 6, end: 10, playbackRate: 1.1 });
  });
});

describe("applyEq", () => {
  it("is a no-op for flat EQ", () => {
    const input = sine(440, 44100, 2048);
    const out = applyEq(input, 44100, FLAT_EQ);
    expect(out.length).toBe(input.length);
    expect(rms(out)).toBeCloseTo(rms(input), 5);
  });

  it("boosts bass energy of a low tone more than a high tone", () => {
    const sr = 44100;
    const bass = sine(60, sr, sr);
    const treble = sine(4000, sr, sr);
    const eq = { bass: 12, low: 0, mid: 0, high: 0, air: 0 };
    const bassOut = applyEq(bass, sr, eq);
    const trebleOut = applyEq(treble, sr, eq);
    expect(rms(bassOut) / rms(bass)).toBeGreaterThan(rms(trebleOut) / rms(treble));
    expect(rms(bassOut)).toBeGreaterThan(rms(bass));
  });
});

describe("BPM and playback rate", () => {
  it("converts 120 BPM at 1.10× to 132 BPM", () => {
    expect(bpmFromPlaybackRate(120, 1.1)).toBeCloseTo(132, 5);
    expect(playbackRateFromBpm(120, 132)).toBeCloseTo(1.1, 5);
  });

  it("clamps target BPM to the 0.5×–2× range", () => {
    expect(playbackRateFromBpm(120, 300)).toBe(2);
    expect(playbackRateFromBpm(120, 40)).toBe(0.5);
  });
});
