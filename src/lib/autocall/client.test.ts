import { describe, expect, it } from "vitest";
import { isAutocallKzNumber } from "./client";

describe("isAutocallKzNumber", () => {
  it("accepts KZ mobile prefixes from AutoCall", () => {
    expect(isAutocallKzNumber("+77011234567")).toBe(true);
    expect(isAutocallKzNumber("+77771234567")).toBe(true);
    expect(isAutocallKzNumber("+77051234567")).toBe(true);
  });

  it("rejects numbers AutoCall will not call", () => {
    expect(isAutocallKzNumber("77011234567")).toBe(false);
    expect(isAutocallKzNumber("+7700123456")).toBe(false);
    expect(isAutocallKzNumber("+19995551234")).toBe(false);
  });
});
