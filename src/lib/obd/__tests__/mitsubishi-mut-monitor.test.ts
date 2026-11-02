import { describe, expect, it } from "vitest";
import type { CatalogSignal } from "@/lib/etacs-coding/diag-catalog";
import {
  isTransmissionEcu,
  mitsubishiFluidBand,
  pickPreferredMonitorSignals,
} from "../mitsubishi-mut-monitor";
import { decodeMitsubishiAt2102And2104, decodeMitsubishiCvt } from "../mitsubishi-modules";

function signal(partial: Partial<CatalogSignal> & { id: string; nameEn: string }): CatalogSignal {
  return {
    nameRu: partial.nameRu ?? partial.nameEn,
    unit: "",
    service: 0x21,
    localId: 0x02,
    bytePos: 3,
    byteLen: 1,
    byteOrder: 2,
    bitPos: -1,
    bitLen: -1,
    signed: false,
    factor: 1,
    offset: 0,
    decimals: 0,
    ...partial,
  };
}

describe("mitsubishi MUT-III fluid windows", () => {
  it("marks 70–80 °C as the ATF / CVT level window", () => {
    expect(mitsubishiFluidBand(40, "8AT / 5AT").id).toBe("cold");
    expect(mitsubishiFluidBand(75, "8AT / 5AT").id).toBe("level");
    expect(mitsubishiFluidBand(75, "CVT").labelRu).toMatch(/CVT/);
    expect(mitsubishiFluidBand(95, "CVT").id).toBe("work");
    expect(mitsubishiFluidBand(120, "8AT / 5AT").id).toBe("hot");
  });
});

describe("MUT-III Data List monitor picker", () => {
  it("pins ATF / RPM / MAP ahead of anonymous items", () => {
    const signals = [
      signal({ id: "x-1", nameEn: "Unknown flag" }),
      signal({ id: "x-2", nameEn: "A/T fluid temp.sensor (Oil pan)", nameRu: "Датчик темп.жидк.АКП (картер)" }),
      signal({ id: "x-3", nameEn: "Engine speed", nameRu: "Обороты" }),
    ];
    expect(pickPreferredMonitorSignals(signals, 2)).toEqual(["x-2", "x-3"]);
    expect(isTransmissionEcu("AT/CVT/A-MT/TC-SST", "AT/CVT")).toBe(true);
  });
});

describe("MUT-III AT8 / CVT temperature scales", () => {
  it("uses A−50 for 8AT pipe and pan sensors", () => {
    const decoded = decodeMitsubishiAt2102And2104([0x00, 10, 0, 8, 0, 122, 108, 25, 51, 0x20, 0x00]);
    expect(decoded.atfTempPipeC).toBe(72);
    expect(decoded.atfTempPanC).toBe(58);
    expect(decoded.atfTempC).toBe(58);
    expect(decoded.atfFormula).toBe("a-50");
  });

  it("uses A−55 for Outlander CVT oil temperature on 21 03", () => {
    const decoded = decodeMitsubishiCvt({
      data2103: [0x04, 0x00, 0x05, 0x00, 0x00, 0x02, 0, 0, 0, 0, 0, 0, 0, 130],
    });
    expect(decoded.atfTempC).toBe(75);
    expect(decoded.atfFormula).toBe("a-55");
  });
});
