import { describe, expect, it } from "vitest";
import { computeSpiderTableauMetrics } from "./useSpiderTableauMetrics";

describe("computeSpiderTableauMetrics", () => {
  it("fits ten columns within landscape phone width", () => {
    const metrics = computeSpiderTableauMetrics({
      availableW: 720,
      availableH: 280,
      maxColumnDepth: 12,
      preferredOffsetRatio: 0.28,
    });

    expect(metrics.fitsWidth).toBe(true);
    expect(metrics.cardW * 10).toBeLessThanOrEqual(720);
    const columnHeight = metrics.cardH + (12 - 1) * metrics.offset;
    expect(columnHeight).toBeLessThanOrEqual(280 + 1);
  });

  it("compresses overlap when columns are tall", () => {
    const metrics = computeSpiderTableauMetrics({
      availableW: 720,
      availableH: 220,
      maxColumnDepth: 18,
      preferredOffsetRatio: 0.28,
    });

    expect(metrics.offsetRatio).toBeLessThan(0.28);
    const columnHeight = metrics.cardH + (18 - 1) * metrics.offset;
    expect(columnHeight).toBeLessThanOrEqual(220 + 2);
  });

  it("fits very deep columns in a short landscape viewport", () => {
    const metrics = computeSpiderTableauMetrics({
      availableW: 720,
      availableH: 250,
      maxColumnDepth: 100,
      preferredOffsetRatio: 0.28,
    });

    const columnHeight = metrics.cardH + (100 - 1) * metrics.offset;
    expect(columnHeight).toBeLessThanOrEqual(250 + 2);
  });
});
