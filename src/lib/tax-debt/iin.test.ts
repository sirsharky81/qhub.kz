import { describe, expect, it } from "vitest";
import { isValidIinBin, normalizeTaxpayerCode, taxpayerKind } from "./iin";

describe("tax-debt iin", () => {
  it("keeps only 12 digits", () => {
    expect(normalizeTaxpayerCode("850 101 300 065 extra")).toBe("850101300065");
  });

  it("accepts a valid IIN checksum", () => {
    expect(isValidIinBin("850101300065")).toBe(true);
    expect(taxpayerKind("850101300065")).toBe("iin");
  });

  it("accepts a valid BIN checksum", () => {
    expect(isValidIinBin("123456789013")).toBe(true);
    expect(taxpayerKind("123456789013")).toBe("bin");
  });

  it("rejects a bad checksum and short values", () => {
    expect(isValidIinBin("850101300064")).toBe(false);
    expect(isValidIinBin("123")).toBe(false);
  });
});
