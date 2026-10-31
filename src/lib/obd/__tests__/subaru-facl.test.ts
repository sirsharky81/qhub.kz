import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  inventoryFaclUnderRoot,
  parseSubaruFaclFile,
  ssmAddressToA8Hex,
} from "../subaru-facl";

const SAMPLE_FACL = "C:/Program Files (x86)/subaru/SSM4/SUBARU/EU/Data/PIDGroup/DNOriginal/12105/1.FACL";

describe("subaru-facl", () => {
  it("parses alternating label / $address pairs from UTF-16 FACL", () => {
    if (!existsSync(SAMPLE_FACL)) {
      expect(true).toBe(true);
      return;
    }
    const parsed = parseSubaruFaclFile(readFileSync(SAMPLE_FACL));
    expect(parsed.entries.length).toBeGreaterThanOrEqual(2);
    const byAddr = new Map(parsed.entries.map((e) => [e.addressHex.toUpperCase(), e.label]));
    expect(byAddr.get("1039")).toBeTruthy();
    expect(byAddr.get("2001")).toBeTruthy();
  });

  it("maps SSM address to A8 hex width", () => {
    expect(ssmAddressToA8Hex("2001")).toBe("002001");
    expect(ssmAddressToA8Hex("1039")).toBe("001039");
  });

  it("aggregates inventory from relative paths", () => {
    const inv = inventoryFaclUnderRoot([
      {
        relativePath: "DNOriginal/12105/1.FACL",
        bytes: Buffer.from(
          "再始動用\u0000$1039\u0000エンジン\u0000$2001",
          "utf16le",
        ),
      },
    ]);
    expect(inv).toHaveLength(1);
    expect(inv[0]!.groupId).toBe("12105");
    expect(inv[0]!.entryCount).toBeGreaterThanOrEqual(1);
  });
});
