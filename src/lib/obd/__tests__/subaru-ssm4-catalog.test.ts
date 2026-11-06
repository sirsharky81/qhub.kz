import { describe, expect, it } from "vitest";
import {
  SSM4_ECUS,
  SSM4_FULL_SYSTEMS,
  SSM4_FUNCTION_CODES,
  SSM4_SIGNALS,
  SSM4_SRP_UTILITY_CATALOG,
  SSM4_UTILITIES,
  SSM4_VEHICLES,
  SUBARU_CANADIAN_OPTION_PRESETS,
  SUBARU_METER_12COLUMN_READ_DIDS,
  SUBARU_METER_VARIANT_SAFE_PATH,
  SUBARU_SSM4_VIN_WMI,
  asciiFromSubaruDidHex,
  buildSsm4RequestHex,
  isSubaruSsm4VinWmiAllowed,
  decodeSsm4SignalPayload,
  decodeSubaruAppliedModel12Columns,
  extractAppliedModelAndOptionCodeFromDump,
  matchSsm4VehicleByVin,
  parseSubaru12ColumnFromAscii,
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
    expect(cvtSig.addressOrDid).toBe("1017");
    expect(decodeSsm4SignalPayload(cvtSig, [0x10, 0x17, 0x55])?.numeric).toBe(35);
    const cvtAlt = SSM4_SIGNALS.find((s) => s.id === "tcm-cvt-temp-10d2")!;
    expect(cvtAlt.addressOrDid).toBe("10D2");
    expect(decodeSsm4SignalPayload(cvtAlt, [0x10, 0xd2, 0x5f])?.numeric).toBe(45);

    const fuelSys = SSM4_SIGNALS.find((s) => s.id === "eng-fuel-sys-obd")!;
    expect(decodeSsm4SignalPayload(fuelSys, [0x03, 0x02])?.text).toContain("замкнутый");
    expect(decodeSsm4SignalPayload(fuelSys, [0x03, 0x01])?.text).toContain("разомкнутый");

    const tpmsSig = SSM4_SIGNALS.find((s) => s.id === "biu-tpms-1")!;
    expect(decodeSsm4SignalPayload(tpmsSig, [0x10, 0x21, 0xe6])?.numeric).toBe(230);
    expect(decodeSsm4SignalPayload(tpmsSig, [0x10, 0x21, 0x08, 0xfc])?.numeric).toBe(230);
  });

  it("defines read-only calibration inspection utilities across all SSM4 systems and SRP catalog", () => {
    expect(SSM4_UTILITIES.map((u) => u.id)).toEqual([
      "util-eps-sas-zero",
      "util-cvt-at-inspection",
      "util-epb-brake-service",
      "util-eyesight-camera-check",
      "util-tpms-inspection",
      "util-ecm-ewg-roughness",
      "util-ecm-elcm-evap",
      "util-tcm-eop-startstop",
      "util-ac-hvac-actuators",
      "util-srh-adb-headlight",
      "util-dms-driverfocus",
      "util-rab-sonar-check",
      "util-keyless-starter-check",
    ]);
    expect(SSM4_FUNCTION_CODES.length).toBeGreaterThanOrEqual(19);
    for (const fn of SSM4_FUNCTION_CODES) {
      expect(fn.subOptions.length).toBeGreaterThan(0);
    }
    expect(SSM4_FULL_SYSTEMS.length).toBe(40);
    expect(SSM4_FULL_SYSTEMS.filter((s) => s.supportsCustomize).length).toBe(16);
    expect(SSM4_SRP_UTILITY_CATALOG.length).toBeGreaterThanOrEqual(11);
    expect(SSM4_ECUS.length).toBe(16);
    expect(SSM4_SIGNALS.length).toBeGreaterThanOrEqual(120);
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

  it("accepts SIA Outback WMI 4S4 in the SSM4 chkDigit1to3 table and rejects unknown WMI", () => {
    expect(isSubaruSsm4VinWmiAllowed("4S4BTGUD2N3XXXXXX")).toBe(true);
    expect(isSubaruSsm4VinWmiAllowed("JF1VA2B62L9XXXXXX")).toBe(true);
    expect(isSubaruSsm4VinWmiAllowed("WVWZZZ3CZWEXXXXXX")).toBe(false);
    expect(SUBARU_SSM4_VIN_WMI).toEqual(["JF1", "JF2", "JF3", "4S3", "4S4", "PLP", "MMR", "JT2"]);
    expect(SUBARU_METER_VARIANT_SAFE_PATH.writeFunction).toBe("sendMetVariByApplied");
    expect(SUBARU_METER_VARIANT_SAFE_PATH.forbiddenInner).toBe("scr_ext_in_writeCommonArea");
  });

  it("parses packed 12-column ASCII (BTACYRBU45D) and DID 0250 hex bytes into US vs Canada", () => {
    expect(parseSubaru12ColumnFromAscii("BTACYRBU45D")).toEqual({
      appliedModel: "BTACYRB",
      optionCode: "U45D",
    });
    expect(parseSubaru12ColumnFromAscii("BTACYRB C05D")).toEqual({
      appliedModel: "BTACYRB",
      optionCode: "C05D",
    });
    expect(asciiFromSubaruDidHex("42 54 41 43 59 52 42 55 34 35 44")).toBe("BTACYRBU45D");

    const usDump = extractAppliedModelAndOptionCodeFromDump({
      vin: "4S4BTGUD2N3000001",
      modules: [
        {
          txHex: "783",
          dids: [
            {
              did: "0250",
              label: "variant",
              hex: "42 54 41 43 59 52 42 55 34 35 44",
              decoded: "noise",
            },
          ],
        },
      ],
    });
    expect(usDump.foundDirectAscii).toBe(true);
    expect(usDump.directAppliedModel).toBe("BTACYRB");
    expect(usDump.directOptionCode).toBe("U45D");
    expect(usDump.inferredRegion).toContain("USA");
    expect(usDump.sourceDid).toBe("783 DID 0250");

    const caDump = extractAppliedModelAndOptionCodeFromDump({
      vin: null,
      modules: [
        {
          txHex: "783",
          dids: [
            {
              did: "0250",
              label: "variant",
              hex: "42 54 41 43 59 52 42 43 30 35 44",
              decoded: "",
            },
          ],
        },
      ],
    });
    expect(caDump.directOptionCode).toBe("C05D");
    expect(caDump.inferredRegion).toContain("CANADA");
    expect(SUBARU_METER_12COLUMN_READ_DIDS[0]).toBe("0250");

    // Reconstructs 2024 MY Outback Wilderness (VIN 4S4BTGUD1R3270223 -> BTAEYR8 + U45L actual, C05L recommended)
    const bitmask2024 = extractAppliedModelAndOptionCodeFromDump({
      vin: "4S4BTGUD1R3270223",
      modules: [
        {
          txHex: "783",
          dids: [
            { did: "0220", label: "DID 0220", hex: "00 00 00 01", decoded: "00 00 00 01" },
          ],
        },
      ],
    });
    expect(bitmask2024.foundDirectAscii).toBe(false);
    expect(bitmask2024.actualAppliedModel).toBe("BTAEYR8");
    expect(bitmask2024.actualOptionCode).toBe("U45L");
    expect(bitmask2024.actualRegion).toContain("USA");
    expect(bitmask2024.recommendedCanadianOptionC0).toBe("C05L");
    expect(bitmask2024.recommendedCanadianOptionC5).toBe("C55L");
  });
});
