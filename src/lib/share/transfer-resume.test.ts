import { describe, expect, it } from "vitest";
import { computeContiguousOffset } from "./transfer-resume";

describe("transfer resume", () => {
  it("computes contiguous offset from ordered chunks", () => {
    const parts = new Map<number, ArrayBuffer>([
      [0, new Uint8Array(100).buffer],
      [100, new Uint8Array(50).buffer],
    ]);
    expect(computeContiguousOffset(parts, 200)).toBe(150);
  });

  it("stops at first gap", () => {
    const parts = new Map<number, ArrayBuffer>([
      [0, new Uint8Array(100).buffer],
      [200, new Uint8Array(50).buffer],
    ]);
    expect(computeContiguousOffset(parts, 300)).toBe(100);
  });
});
