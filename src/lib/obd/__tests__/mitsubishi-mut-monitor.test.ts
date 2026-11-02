import { describe, expect, it } from "vitest";
import type { CatalogSignal } from "@/lib/etacs-coding/diag-catalog";
import {
  buildMitsubishiVisitReport,
  ecuMatchesServiceSet,
  isTransmissionEcu,
  mitsubishiFluidBand,
  parseMitsubishiModuleIdentity,
  pickPreferredMonitorSignals,
  pickServiceSetSignals,
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

describe("module identity and service sets", () => {
  it("reads diagnostic version 0104 from 1A 9C and the part number from 1A 87", () => {
    const version = parseMitsubishiModuleIdentity(
      "1A 9C",
      [0x9c, 0x01, 0x04, 0x82, 0x00, 0x17, 0xff, 0x3d, 0x00, 0x00, 0x31, 0x38, 0x36, 0x30, 0x44, 0x33, 0x36, 0x32],
    );
    expect(version.diagVersion).toBe("0104");
    expect(version.partNumber).toBeNull();
    const part = parseMitsubishiModuleIdentity(
      "1A 87",
      [0x87, 0x04, 0x82, 0x00, 0x17, 0xff, 0x20, 0x00, 0x3d, 0x00, 0x00, 0x31, 0x38, 0x36, 0x30, 0x44, 0x33, 0x36, 0x32],
    );
    expect(part.partNumber).toBe("1860D362");
    expect(part.diagVersion).toBeNull();
  });

  it("pins the engine service set and builds a visit CSV", () => {
    const signals = [
      signal({ id: "door", nameEn: "Door switch", nameRu: "Концевик двери" }),
      signal({ id: "rpm", nameEn: "Engine speed", nameRu: "Обороты" }),
      signal({ id: "stft", nameEn: "Short term fuel trim", nameRu: "STFT" }),
      signal({ id: "rail", nameEn: "Fuel rail pressure", nameRu: "Давление в рампе" }),
    ];
    expect(pickServiceSetSignals(signals, "engine", 3)).toEqual(["rpm", "stft", "rail"]);
    expect(ecuMatchesServiceSet("MPI/GDI/DIESEL", "Двигатель", "engine")).toBe(true);
    expect(ecuMatchesServiceSet("4WD/AWC", "Полный привод", "4wd")).toBe(true);
    expect(ecuMatchesServiceSet("ETACS", "ETACS", "body")).toBe(true);
    const csv = buildMitsubishiVisitReport({
      vin: "JMBXKR1WHEZ000001",
      vehicleName: "Pajero Sport III",
      modules: [
        {
          nameRu: "Двигатель",
          address: "0x7E0→0x7E8",
          responded: true,
          partNumber: "1860D362",
          dtcs: [{ code: "P0171", textRu: "Бедная смесь", remedy: "Проверить подсос", active: true }],
        },
      ],
      transmission: {
        kind: "8AT / 5AT",
        tempC: 75,
        pipeC: 72,
        panC: 75,
        formula: "8AT/5AT A-50",
        bandRu: "Окно уровня ATF",
        selector: "P",
        gear: "P/N",
        inputRpm: 0,
        outputRpm: 0,
        degradation: null,
      },
      pressures: [{ label: "Давление в рампе", value: "40" }],
      tpms: [],
      meter: null,
      live: [{ name: "Обороты", value: "800", unit: "r/min" }],
    });
    expect(csv).toContain("JMBXKR1WHEZ000001");
    expect(csv).toContain("P0171");
    expect(csv).toContain("Бедная смесь");
    expect(csv).toContain("75");
    expect(csv).toContain("Давление в рампе");
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
