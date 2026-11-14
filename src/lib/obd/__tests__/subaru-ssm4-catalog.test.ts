import { describe, expect, it } from "vitest";
import {
  lookupSsm4YywFingerprint,
  yywFingerprintToDidByteMap,
} from "../subaru-ssm4-yyw-fingerprints";
import { SUBARU_EYESIGHT_ADA031_WRITE_DIDS } from "../subaru-eyesight-variant";
import {
  SSM4_ECUS,
  SSM4_FULL_SYSTEMS,
  SSM4_FUNCTION_CODES,
  SSM4_SIGNALS,
  SSM4_SRP_UTILITY_CATALOG,
  SSM4_UTILITIES,
  SSM4_VEHICLES,
  SUBARU_CANADIAN_OPTION_PRESETS,
  SUBARU_EYESIGHT_VARIANT_READ_DIDS,
  SUBARU_METER_12COLUMN_READ_DIDS,
  SUBARU_METER_SSM4_MHZ_READ_DIDS,
  SUBARU_METER_VARIANT_SAFE_PATH,
  SUBARU_SSM4_VIN_WMI,
  SUBARU_METER_VARIANT_READ_FACTS,
  asciiFromSubaruDidHex,
  buildSsm4RequestHex,
  isSsm4CgdwPairValid,
  isSubaruSsm4VinWmiAllowed,
  decodeSsm4SignalPayload,
  decodeSubaruAppliedModel12Columns,
  extractAppliedModelAndOptionCodeFromDump,
  compareMeterAndEyesightVariants,
  extractEyesightVariantFromDids,
  matchSsm4OptionFromEyesightDids,
  diffEyesightAgainstAppliedCatalog,
  diffMeterAgainstAppliedCatalog,
  getSsm4YywWriteDids,
  matchSsm4OptionFromMeterDids,
  matchSsm4VehicleByVin,
  parseSubaru12ColumnFromAscii,
  resolveCanadianOptionCodesForSubaru,
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

  it("resolves Canadian Option Codes from SSM4 cgdw (BTACYR8/BTAEYR8 → C0QF, not C0RC/C05D)", () => {
    const res = decodeSubaruAppliedModel12Columns("BTACYR8", "U45D");
    expect(res.valid).toBe(true);
    expect(res.validInSsm4Cgdw).toBe(true);
    expect(res.seriesCode).toBe("BTA");
    expect(res.modelYearChar).toBe("C");
    expect(res.gradeChar).toBe("R");
    expect(res.drivetrainChar).toBe("8");
    expect(res.optionDestinationPrefix).toBe("U4");
    expect(res.canadianOptionCodeC0).toBe("C0QF");
    expect(res.canadianOptionCodeC5).toBe("U45D");
    expect(res.cgdwOptionCodes).toEqual(["U45D", "U45X", "C0QF"]);

    const my2024 = decodeSubaruAppliedModel12Columns("BTAEYR8", "U45D");
    expect(my2024.validInSsm4Cgdw).toBe(true);
    expect(my2024.canadianOptionCodeC0).toBe("C0QF");
    expect(my2024.canadianOptionCodeC5).toBe("C0RF");
    expect(isSsm4CgdwPairValid("BTAEYR8", "C0QF")).toBe(true);
    expect(isSsm4CgdwPairValid("BTAEYR8", "C0RC")).toBe(false);
    expect(isSsm4CgdwPairValid("BTACYR8", "C05D")).toBe(false);
    expect(resolveCanadianOptionCodesForSubaru("BTAEYR8", "U45L")).toEqual({
      primaryC0: "C0QF",
      secondaryAlt: "C0RF",
    });

    // Dual X-Mode is 6th Applied char; Limited 2.5 suggests Onyx …T…
    const lim25 = decodeSubaruAppliedModel12Columns("BT9CYDL", "U54G");
    expect(lim25.validInSsm4Cgdw).toBe(true);
    expect(lim25.canadianOptionCodeC0).toBe("C54G");
    expect(lim25.dualXModeAppliedModelSuggestion).toBe("BT9CYTL");

    expect(SUBARU_CANADIAN_OPTION_PRESETS[0]?.canadianOptionCodeC0).toBe("C0QF");
    expect(SUBARU_METER_VARIANT_READ_FACTS.a002Map["03"]).toBe("C0");
    expect(SUBARU_CANADIAN_OPTION_PRESETS.length).toBeGreaterThanOrEqual(5);
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

    // Reconstructs 2024 MY Outback Wilderness (VIN 4S4BTGUD1R3270223 -> BTAEYR8 + U45D from cgdw, CA C0QF/C0RF)
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
    expect(bitmask2024.actualOptionCode).toBe("U45D");
    expect(bitmask2024.actualRegion).toContain("USA");
    expect(bitmask2024.recommendedCanadianOptionC0).toBe("C0QF");
    expect(bitmask2024.recommendedCanadianOptionC5).toBe("C0RF");

    // Regression: DID A002 = 02 with numeric temperature hint "-38°C/-48°C" must NEVER
    // glue "38C" + "48C" into bogus Mexican Option Code "C48C" / "C08C"
    expect(parseSubaru12ColumnFromAscii("02  [число=2 · темп=-38°C/-48°C · 1%]")).toEqual({
      appliedModel: null,
      optionCode: null,
    });
    const liveA002Dump = extractAppliedModelAndOptionCodeFromDump({
      vin: "4S4BTGUD1R3270223",
      modules: [
        {
          txHex: "783",
          dids: [
            {
              did: "A000",
              label: "DID A000",
              hex: "4F 9B 94 81",
              decoded: "Карта поддерживаемых DID (A000): 4F 9B 94 81 → открыты [A002, A005, A006, A007]",
            },
            {
              did: "A002",
              label: "DID A002",
              hex: "02",
              decoded: "02  [число=2 · темп=-38°C/-48°C · 1%]",
            },
            {
              did: "A011",
              label: "DID A011",
              hex: "FF",
              decoded: "FF  [число=255 · темп=215°C/205°C · 100%]",
            },
          ],
        },
      ],
    });
    expect(liveA002Dump.foundDirectAscii).toBe(false);
    expect(liveA002Dump.actualAppliedModel).toBe("BTAEYR8");
    expect(liveA002Dump.actualOptionCode).toBe("U45D");
    expect(liveA002Dump.actualRegion).toBe("USA (U4 / U5 / U6 — °F, мили)");
    expect(liveA002Dump.recommendedCanadianOptionC0).toBe("C0QF");
    expect(liveA002Dump.recommendedCanadianOptionC5).toBe("C0RF");
    expect(liveA002Dump.explanationRu).toContain("A002");

    // Different Outback: 2021 Outback 2.5i Limited (VIN 4S4BTADC5M3123456) with A002 = 05 (U5 PZEV)
    const outback2021Lim = extractAppliedModelAndOptionCodeFromDump({
      vin: "4S4BTADC5M3123456",
      modules: [
        {
          txHex: "783",
          dids: [
            { did: "A002", label: "DID A002", hex: "05", decoded: "05" },
            { did: "A011", label: "DID A011", hex: "FF", decoded: "FF" },
          ],
        },
      ],
    });
    expect(outback2021Lim.actualAppliedModel).toBe("BT9BYDC");
    expect(outback2021Lim.actualOptionCode).toBe("U57H");
    expect(outback2021Lim.actualRegion).toBe("USA (U4 / U5 / U6 — °F, мили)");
    expect(outback2021Lim.recommendedCanadianOptionC0).toBe("C07H");
    expect(outback2021Lim.recommendedCanadianOptionC5).toBe("C57H");

    // 2022 Outback Wilderness (B-pillar photo VIN 4S4BTGUD2N3149226 -> BTACYR8 + U45D -> Canadian C0QF!)
    const outback2022Wilderness = extractAppliedModelAndOptionCodeFromDump({
      vin: "4S4BTGUD2N3149226",
      modules: [
        {
          txHex: "783",
          dids: [
            { did: "A002", label: "DID A002", hex: "03", decoded: "03" },
            { did: "A011", label: "DID A011", hex: "FF", decoded: "FF" },
          ],
        },
      ],
    });
    expect(outback2022Wilderness.actualAppliedModel).toBe("BTACYR8");
    expect(outback2022Wilderness.actualOptionCode).toBe("C0QF");
    expect(outback2022Wilderness.recommendedCanadianOptionC0).toBe("C0QF");
    expect(outback2022Wilderness.recommendedCanadianOptionC5).toBe("U45D");

    // Different Outback: 2023 Outback Onyx XT 2.4T (VIN 4S4BTGND8P3123456) already converted to Canada (A002 = 03, A011 = 00)
    const outback2023OnyxCa = extractAppliedModelAndOptionCodeFromDump({
      vin: "4S4BTGND8P3123456",
      modules: [
        {
          txHex: "783",
          dids: [
            { did: "A002", label: "DID A002", hex: "03", decoded: "03" },
            { did: "A011", label: "DID A011", hex: "00", decoded: "00" },
          ],
        },
      ],
    });
    expect(outback2023OnyxCa.actualAppliedModel).toBe("BTADYH8");
    expect(outback2023OnyxCa.actualOptionCode).toBe("C0QF");
    expect(outback2023OnyxCa.actualRegion).toBe("CANADA (C0 / C5 — °C, км/ч)");

    // Full A0xx fingerprint reverse-match: SSM4 wrote DID mask, not ASCII 7+4 —
    // but Option Code can be downloaded by matching cgdw (C0QF vs C0RF via A036).
    // Full catalog row distinguishes BTAEYR8+C0QF (no A02E) from BTADYR8+C0QF (A02E=00)
    expect(
      matchSsm4OptionFromMeterDids(null, {
        A002: "03",
        A011: "00",
        A007: "30",
        A016: "03",
        A021: "14",
        A024: "02",
        A027: "02",
        A028: "01",
        A02D: "01",
        A036: "00",
        A02E: "--",
      }),
    ).toMatchObject({
      optionCode: "C0QF",
      appliedModel: "BTAEYR8",
      unique: true,
      candidates: ["BTAEYR8+C0QF"],
    });
    expect(
      matchSsm4OptionFromMeterDids(null, {
        A002: "03",
        A011: "00",
        A007: "30",
        A016: "03",
        A021: "14",
        A024: "02",
        A027: "02",
        A028: "01",
        A02D: "01",
        A036: "FF",
        A02E: "--",
      }),
    ).toMatchObject({
      optionCode: "C0RF",
      appliedModel: "BTAEYR8",
      unique: true,
      candidates: ["BTAEYR8+C0RF"],
    });
    // Without probing A02E (unread), C0QF still collides — must read all written DIDs
    expect(
      matchSsm4OptionFromMeterDids(null, {
        A002: "03",
        A011: "00",
        A007: "30",
        A016: "03",
        A021: "14",
        A024: "02",
        A027: "02",
        A028: "01",
        A02D: "01",
        A036: "00",
      })?.unique,
    ).toBe(false);

    const fpDump = extractAppliedModelAndOptionCodeFromDump({
      vin: "4S4BTGUD1R3270223",
      modules: [
        {
          txHex: "783",
          dids: [
            { did: "A002", label: "DID A002", hex: "03", decoded: "03" },
            { did: "A011", label: "DID A011", hex: "00", decoded: "00" },
            { did: "A007", label: "DID A007", hex: "30", decoded: "30" },
            { did: "A016", label: "DID A016", hex: "03", decoded: "03" },
            { did: "A021", label: "DID A021", hex: "14", decoded: "14" },
            { did: "A024", label: "DID A024", hex: "02", decoded: "02" },
            { did: "A027", label: "DID A027", hex: "02", decoded: "02" },
            { did: "A028", label: "DID A028", hex: "01", decoded: "01" },
            { did: "A02D", label: "DID A02D", hex: "01", decoded: "01" },
            { did: "A02E", label: "DID A02E", hex: "--", decoded: "absent" },
            { did: "A036", label: "DID A036", hex: "FF", decoded: "FF" },
          ],
        },
      ],
    });
    expect(fpDump.actualOptionCode).toBe("C0RF");
    expect(fpDump.actualAppliedModel).toBe("BTAEYR8");
    expect(fpDump.sourceDid).toBe("783 A0xx fingerprint→cgdw");
    expect(fpDump.explanationRu).toContain("уникальной строки cgdw");
    expect(fpDump.explanationRu).toContain("не из VIN");
    expect(SUBARU_METER_VARIANT_READ_FACTS.fingerprintDidKeys).toContain("A036");

    const partialUs = diffMeterAgainstAppliedCatalog("BTAEYR8", {
      A002: "02",
      A011: "FF",
      A024: "04",
      A036: "00",
    });
    const byOpt = Object.fromEntries(partialUs.map((row) => [row.optionCode, row]));
    expect(byOpt.U45D?.diffs).toEqual([]);
    expect(byOpt.U4TD?.diffs).toEqual([{ did: "A036", car: "00", catalog: "FF" }]);
    expect(byOpt.U45J?.diffs).toEqual([{ did: "A024", car: "04", catalog: "02" }]);
    expect(byOpt.C0QF?.diffs.map((d) => d.did)).toEqual(["A002", "A011", "A024"]);
    expect(byOpt.C0RF?.diffs.map((d) => d.did)).toEqual(["A002", "A011", "A024", "A036"]);
    expect(byOpt.U45L).toBeUndefined();

    // SSM4 mHZ Read DID TBL has exact 46 DIDs (including A004, A017, A037, A040)
    expect(SUBARU_METER_SSM4_MHZ_READ_DIDS).toHaveLength(46);
    for (const did of ["A000", "A004", "A017", "A020", "A037", "A040", "A041"] as const) {
      expect(SUBARU_METER_SSM4_MHZ_READ_DIDS).toContain(did);
      expect(SUBARU_METER_12COLUMN_READ_DIDS).toContain(did);
    }
    expect(SUBARU_METER_12COLUMN_READ_DIDS).toContain("A00E");
    expect(SUBARU_METER_12COLUMN_READ_DIDS).toContain("10C2");

    // Extra A0xx DID outside 41 cgdw keys (e.g. A017) is reported as car-only difference against `--`
    const withExtra = diffMeterAgainstAppliedCatalog("BTAEYR8", {
      A002: "02",
      A011: "FF",
      A017: "01",
      A024: "04",
      A036: "00",
    });
    const extraU45d = withExtra.find((r) => r.optionCode === "U45D");
    expect(extraU45d?.diffs).toContainEqual({ did: "A017", car: "01", catalog: "--" });
    expect(SUBARU_METER_VARIANT_READ_FACTS.eyesightLib).toBe("Y-YwPHBWHoZ.mLW");

    // EyeSight Y-Yw 35xx: C0RF unique globally; compare vs meter
    const esC0rf = matchSsm4OptionFromEyesightDids("BTAEYR8", {
      "3501": "A5",
      "3502": "30",
      "3503": "EC",
      "3504": "C7",
      "3505": "12",
      "3506": "9B",
      "3507": "48",
      "3508": "00",
      "3509": "D3",
      "350A": "08",
      "350B": "00",
      "350C": "00",
      "350D": "00",
      "350E": "00",
      "350F": "00",
      "3510": "00",
    });
    expect(esC0rf).toMatchObject({
      optionCode: "C0RF",
      appliedModel: "BTAEYR8",
      unique: true,
    });
    const esExtract = extractEyesightVariantFromDids(
      [
        { did: "3501", hex: "A5" },
        { did: "3502", hex: "30" },
        { did: "3503", hex: "EC" },
        { did: "3504", hex: "C7" },
        { did: "3505", hex: "12" },
        { did: "3506", hex: "9B" },
        { did: "3507", hex: "48" },
        { did: "3508", hex: "00" },
        { did: "3509", hex: "D3" },
        { did: "350A", hex: "08" },
        { did: "350B", hex: "00" },
        { did: "350C", hex: "00" },
        { did: "350D", hex: "00" },
        { did: "350E", hex: "00" },
        { did: "350F", hex: "00" },
        { did: "3510", hex: "00" },
      ],
      null,
    );
    expect(esExtract.optionCode).toBe("C0RF");
    expect(esExtract.destinationHint).toBe("CANADA");

    const aligned = compareMeterAndEyesightVariants(
      {
        actualAppliedModel: "BTAEYR8",
        actualOptionCode: "C0RF",
        actualRegion: "CANADA (C0 / C5 — °C, км/ч)",
      },
      esExtract,
    );
    expect(aligned.optionCodesMatch).toBe(true);
    expect(aligned.regionsAligned).toBe(true);

    const mismatch = compareMeterAndEyesightVariants(
      {
        actualAppliedModel: "BTAEYR8",
        actualOptionCode: "U45D",
        actualRegion: "USA (U4 / U5 / U6 — °F, мили)",
      },
      esExtract,
    );
    expect(mismatch.optionCodesMatch).toBe(false);
    expect(mismatch.regionsAligned).toBe(false);
    expect(mismatch.verdictRu).toContain("Расхождение");
  });

  it("maps Y-Yw fingerprints to ADA-031 2E bytes (BTAEYR8 US vs CA)", () => {
    const us = lookupSsm4YywFingerprint("BTAEYR8", "U45D");
    const ca = lookupSsm4YywFingerprint("BTAEYR8", "C0QF");
    expect(us?.fp).toMatch(/^A520/);
    expect(ca?.fp).toMatch(/^A530/);
    const usMap = yywFingerprintToDidByteMap(us!.fp);
    const caMap = yywFingerprintToDidByteMap(ca!.fp);
    expect(usMap["3502"]).toBe("20");
    expect(caMap["3502"]).toBe("30");
    for (const did of SUBARU_EYESIGHT_ADA031_WRITE_DIDS) {
      expect(usMap[did]).toHaveLength(2);
      expect(caMap[did]).toHaveLength(2);
    }

    // Full 16 DIDs (3501..350A + 350B..3510 from Y-YwPHBW-WmPGBu.mHZ / ADA-031 ReadWriteDidListData)
    const writeList = getSsm4YywWriteDids("BTAEYR8", "C0QF");
    expect(writeList).toHaveLength(16);
    expect(writeList?.find((w) => w.did === "3502")?.byteHex).toBe("30");
    expect(writeList?.find((w) => w.did === "3510")?.byteHex).toBe("00");
    expect(SUBARU_EYESIGHT_VARIANT_READ_DIDS).toContain("3510");
    expect(SUBARU_EYESIGHT_VARIANT_READ_DIDS).toContain("309D");

    // Diff US BTAEYR8 EyeSight dump against all Y-Yw rows for BTAEYR8
    const esDiff = diffEyesightAgainstAppliedCatalog("BTAEYR8", usMap);
    const esByOpt = Object.fromEntries(esDiff.map((r) => [r.optionCode, r]));
    expect(esByOpt.U45D?.identical).toBe(true);
    expect(esByOpt.U45D?.diffs).toEqual([]);
    expect(esByOpt.U4TD?.diffs).toEqual([{ did: "3509", car: "C3", catalog: "D3" }]);
    expect(esByOpt.U45J?.diffs).toEqual([{ did: "3504", car: "C7", catalog: "C6" }]);
    expect(esByOpt.C0QF?.diffs).toEqual([{ did: "3502", car: "20", catalog: "30" }]);
    expect(esByOpt.C0RF?.diffs).toEqual([
      { did: "3502", car: "20", catalog: "30" },
      { did: "3509", car: "C3", catalog: "D3" },
    ]);

    // Unread EyeSight DIDs ("--") must be treated as unread slots, not 16 false mismatches
    const emptyDump = Object.fromEntries(
      Array.from({ length: 16 }, (_, i) => [
        `35${(i + 1).toString(16).padStart(2, "0").toUpperCase()}`,
        "--",
      ]),
    );
    const emptyDiff = diffEyesightAgainstAppliedCatalog("BTAEYR8", emptyDump);
    expect(emptyDiff[0]?.diffs).toEqual([]);
    expect(emptyDiff[0]?.unreadSlots).toBe(16);
    expect(emptyDiff[0]?.identical).toBe(false);
  });
});
