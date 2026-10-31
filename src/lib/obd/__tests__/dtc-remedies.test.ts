import { describe, expect, it } from "vitest";
import { parseUdsDtcs1902 } from "../uds";
import { remedyForDtcCode } from "../dtc-remedies";
import { decodeMitsubishiTpmsWheelBytes } from "../mitsubishi-modules";

describe("dtc-remedies", () => {
  it("returns remedy for known and generic codes", () => {
    expect(remedyForDtcCode("P0171").length).toBeGreaterThan(20);
    expect(remedyForDtcCode("P9999").length).toBeGreaterThan(10);
  });

  it("attach remedy on UDS DTC parse", () => {
    const dtcs = parseUdsDtcs1902([0x02, 0xff, 0x01, 0x71, 0x00, 0x2f]);
    expect(dtcs[0]?.remedy).toContain("подсос");
  });
});

describe("mitsubishi tpms wheel decode", () => {
  it("decodes 160/75 test vector", () => {
    const w = decodeMitsubishiTpmsWheelBytes(160, 75);
    expect(w.pressureBar).toBeCloseTo(2.2, 1);
    expect(w.temperatureC).toBe(25);
  });
});
