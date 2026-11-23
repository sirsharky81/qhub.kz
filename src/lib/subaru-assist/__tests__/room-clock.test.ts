import { describe, expect, it } from "vitest";
import { assistRemainingMs, formatAssistRemaining } from "../room-clock";

describe("assist room clock", () => {
  it("counts down to the room expiry and never goes negative", () => {
    expect(assistRemainingMs(10_000, 4_000)).toBe(6_000);
    expect(assistRemainingMs(4_000, 10_000)).toBe(0);
  });

  it("formats the remaining hour as mm:ss", () => {
    expect(formatAssistRemaining(65_000)).toBe("01:05");
    expect(formatAssistRemaining(3_600_000)).toBe("1:00:00");
    expect(formatAssistRemaining(0)).toBe("00:00");
  });
});
