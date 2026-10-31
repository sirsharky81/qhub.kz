import { describe, expect, it } from "vitest";
import {
  cvtTempBand,
  decodeSubaruTemperatureBytes,
  decodeSubaruTpmsBytes,
} from "../subaru-decode";

describe("subaru-decode", () => {
  it("decodes CVTF temperature from 1-byte and 2-byte DID 103D payloads", () => {
    expect(decodeSubaruTemperatureBytes([0x5a])).toEqual({ celsius: 50, formula: "a-40" });
    expect(decodeSubaruTemperatureBytes([0x00, 0x5a])).toEqual({ celsius: 50, formula: "a-40" });
    // 0x0172 = 370 → 37.0 °C (окно уровня CVTF 35–45)
    expect(decodeSubaruTemperatureBytes([0x01, 0x72])).toEqual({ celsius: 37, formula: "u16/10" });
    // 0x0320 = 800 → 80.0 °C (окно адаптации)
    expect(decodeSubaruTemperatureBytes([0x03, 0x20])).toEqual({ celsius: 80, formula: "u16/10" });
  });

  it("marks CVTF inspection windows", () => {
    expect(cvtTempBand(40).id).toBe("level");
    expect(cvtTempBand(72).id).toBe("learn");
    expect(cvtTempBand(20).id).toBe("cold");
  });

  it("decodes Subaru TPMS as 0.2 PSI/count, raw kPa, or 16-bit kPa", () => {
    // 0xA4 = 164 ticks × 0.2 PSI = 2.26 bar (US-style)
    const us = decodeSubaruTpmsBytes([0xa4])!;
    expect(us.bar).toBe(2.26);
    expect(us.psi).toBe(32.8);
    expect(us.formula).toBe("psi-0.2");

    // 230 raw is already kPa for EUDM / CIS cars (2.30 bar), not 3.17 bar
    const metric = decodeSubaruTpmsBytes([0xe6])!;
    expect(metric.kpa).toBe(230);
    expect(metric.bar).toBe(2.3);
    expect(metric.formula).toBe("kpa");

    const padded = decodeSubaruTpmsBytes([0x00, 0xe6])!;
    expect(padded.kpa).toBe(230);

    const tenth = decodeSubaruTpmsBytes([0x08, 0xfc])!;
    expect(tenth.kpa).toBe(230);
    expect(tenth.formula).toBe("kpa-0.1");

    const withTemp = decodeSubaruTpmsBytes([0xa4, 0x4b])!;
    expect(withTemp.bar).toBe(2.26);
    expect(withTemp.temperatureC).toBe(35);
  });
});
