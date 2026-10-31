import { describe, expect, it } from "vitest";
import {
  SSM4_ECUS,
  SSM4_SIGNALS,
  SSM4_UTILITIES,
  SSM4_VEHICLES,
  SUBARU_CANADIAN_OPTION_PRESETS,
  buildSsm4RequestHex,
  decodeSsm4SignalPayload,
  decodeSubaruAppliedModel12Columns,
  matchSsm4VehicleByVin,
} from "../subaru-ssm4-catalog";

describe("subaru-ssm4-catalog", () => {
  it("groups Subaru ECUs into Powertrain, Chassis, and Body matching SSM4 GetEcuGroupList", () => {
    const groups = new Set(SSM4_ECUS.map((e) => e.group));
    expect(groups.has("Powertrain")).toBe(true);
    expect(groups.has("Chassis")).toBe(true);
    expect(groups.has("Body")).toBe(true);

    // Safety-critical modules (ABS 7B0, EPS 746, EyeSight 787, SRS 780) must disallow clearing DTCs
    for (const tx of ["7B0", "746", "787", "780"]) {
      const ecu = SSM4_ECUS.find((e) => e.txHex === tx);
      expect(ecu).toBeDefined();
      expect(ecu?.safetyCritical).toBe(true);
      expect(ecu?.canSafeClear).toBe(false);
    }
  });

  it("matches Subaru vehicles by VIN prefix and chassis code", () => {
    expect(matchSsm4VehicleByVin("JF1SK7LL5KG012345")?.id).toBe("sk-forester-sgp");
    expect(matchSsm4VehicleByVin("4S4BTANC1N3123456")?.id).toBe("bt-outback-sgp");
    expect(matchSsm4VehicleByVin("JF1GTELL5JG001122")?.id).toBe("gt-gk-xv-impreza-sgp");
    expect(matchSsm4VehicleByVin("JF1VAB12345678901")?.id).toBe("va-vm-vb-wrx-levorg");
    expect(matchSsm4VehicleByVin("4S4WMAA1234567890")?.id).toBe("wm-ascent-sgp");
    expect(SSM4_VEHICLES.length).toBeGreaterThanOrEqual(6);
  });

  it("builds SSM 0xA8 and UDS 0x22 request frames and decodes responses accurately", () => {
    const rpmSig = SSM4_SIGNALS.find((s) => s.id === "eng-rpm-ssm")!;
    expect(buildSsm4RequestHex(rpmSig)).toEqual({
      serviceSid: 0xa8,
      requestHex: "A8 00 00 00 0E",
    });
    // 3000 rpm -> raw = 12000 = 0x2EE0
    const decodedRpm = decodeSsm4SignalPayload(rpmSig, [0x2e, 0xe0]);
    expect(decodedRpm).toEqual({ text: "3000", numeric: 3000 });

    const steeringAngleSig = SSM4_SIGNALS.find((s) => s.id === "eps-steering-angle")!;
    expect(buildSsm4RequestHex(steeringAngleSig)).toEqual({
      serviceSid: 0x22,
      requestHex: "22 1041",
    });
    // -12.5 deg -> raw = -125 = 0xFF83 after DID echo 10 41
    const decodedAngle = decodeSsm4SignalPayload(steeringAngleSig, [0x10, 0x41, 0xff, 0x83]);
    expect(decodedAngle).toEqual({ text: "-12.5", numeric: -12.5 });

    const coolantObd = SSM4_SIGNALS.find((s) => s.id === "eng-coolant-obd")!;
    expect(buildSsm4RequestHex(coolantObd)).toEqual({ serviceSid: 0x01, requestHex: "01 05" });
    expect(decodeSsm4SignalPayload(coolantObd, [0x05, 0x5a])).toEqual({ text: "50", numeric: 50 });

    const cvtSig = SSM4_SIGNALS.find((s) => s.id === "tcm-atf-temp-uds")!;
    expect(decodeSsm4SignalPayload(cvtSig, [0x10, 0x3d, 0x01, 0x72])?.numeric).toBe(37);

    const tpmsSig = SSM4_SIGNALS.find((s) => s.id === "biu-tpms-1")!;
    expect(decodeSsm4SignalPayload(tpmsSig, [0x10, 0x21, 0xe6])?.numeric).toBe(230);
    expect(decodeSsm4SignalPayload(tpmsSig, [0x10, 0x21, 0x08, 0xfc])?.numeric).toBe(230);
  });

  it("defines read-only calibration inspection utilities for EPS, CVT, EPB, EyeSight, and TPMS", () => {
    expect(SSM4_UTILITIES.map((u) => u.id)).toEqual([
      "util-eps-sas-zero",
      "util-cvt-at-inspection",
      "util-epb-brake-service",
      "util-eyesight-camera-check",
      "util-tpms-inspection",
    ]);
  });

  it("decodes TSB 07-183-20 (MC-10182242-0001.pdf) 7-digit Applied Model + 4-digit Option Code (e.g. BTACYRB + U45D -> C05D)", () => {
    const res = decodeSubaruAppliedModel12Columns("BTACYRB", "U45D");
    expect(res.valid).toBe(true);
    expect(res.seriesCode).toBe("BTA");
    expect(res.modelYearChar).toBe("C");
    expect(res.gradeChar).toBe("R");
    expect(res.optionDestinationPrefix).toBe("U4");
    expect(res.canadianOptionCodeC0).toBe("C05D");
    expect(res.canadianOptionCodeC5).toBe("C55D");

    // Single X-Mode Outback Limited 2.5i (BT9CYDC) suggests Dual X-Mode Onyx 2.5i (BT9CYTC)
    const lim25 = decodeSubaruAppliedModel12Columns("BT9CYDC", "U57H");
    expect(lim25.canadianOptionCodeC0).toBe("C07H");
    expect(lim25.canadianOptionCodeC5).toBe("C57H");
    expect(lim25.dualXModeAppliedModelSuggestion).toBe("BT9CYTC");

    expect(SUBARU_CANADIAN_OPTION_PRESETS.length).toBeGreaterThanOrEqual(12);
  });
});
