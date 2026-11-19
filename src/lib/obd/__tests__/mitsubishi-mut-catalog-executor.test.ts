import { describe, expect, it } from "vitest";
import { buildCatalogMutRequestHex } from "../mitsubishi-mut-catalog-executor";

describe("buildCatalogMutRequestHex", () => {
  it("builds KWP 30 and 31 frames with local id and req tail", () => {
    expect(
      buildCatalogMutRequestHex({
        udsServiceId: 0x30,
        localId: 0x07,
        reqMsg: "01",
      }),
    ).toBe("300701");
    expect(
      buildCatalogMutRequestHex({
        udsServiceId: 0x31,
        localId: 0x14,
        reqMsg: "0100",
      }),
    ).toBe("31140100");
  });

  it("uses upload hex for large 3B calibration payloads", () => {
    expect(
      buildCatalogMutRequestHex(
        { udsServiceId: 0x3b, localId: 0x08, reqMsg: "PLACEHOLDER" },
        "AABBCC",
      ),
    ).toBe("3b08AABBCC");
  });
});