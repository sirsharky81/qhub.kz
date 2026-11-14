import { describe, expect, it } from "vitest";
import type { ModuleDtcReport } from "../obd-session";
import { SSM4_FULL_SYSTEMS } from "../subaru-ssm4-catalog";
import {
  EXCLUDED_SUBARU_CODING_WORK_IDS,
  SUBARU_ALL_DTC_TARGETS,
  classifySubaruDtcStatus,
  decodeSubaruVinInfo,
  formatSubaruUserValue,
  getAllSubaruBlockProfiles,
  getSubaruBlockProfile,
  getSubaruBlockScanStatus,
  isSubaruTxSafeToClear,
  sortSubaruScanReports,
} from "../subaru-ssm4-modules";

describe("subaru-ssm4-modules", () => {
  it("decodes Subaru VIN model, year, and plant country", () => {
    const outback = decodeSubaruVinInfo("4S4BTANC1N3123456");
    expect(outback?.vehicle?.id).toBe("bt-outback-sgp");
    expect(outback?.modelYear).toBe(2022);
    expect(outback?.plantCountry).toBe("США (SIA Lafayette)");

    const forester = decodeSubaruVinInfo("JF1SK7LL5KG012345");
    expect(forester?.vehicle?.id).toBe("sk-forester-sgp");
    expect(forester?.modelYear).toBe(2019);
    expect(forester?.plantCountry).toBe("Япония (Gunma)");
  });

  it("classifies Current vs History DTCs per ISO 14229 statusByte", () => {
    expect(
      classifySubaruDtcStatus({
        code: "P0300",
        active: true,
        description: "Misfire",
        statusByte: 0x09,
      }),
    ).toBe("current");
    expect(
      classifySubaruDtcStatus({
        code: "U0073",
        active: true, // parseUdsDtcs1902 sets active=true when bit3 (0x08) is set
        description: "Bus off",
        statusByte: 0x28,
      }),
    ).toBe("history");
  });

  it("sorts scan reports: Current -> History -> No DTC -> Unscanned -> Not Detected", () => {
    const mkReport = (
      txHex: string,
      responded: boolean,
      dtcs: ModuleDtcReport["dtcs"] = [],
    ): { id: string; report?: ModuleDtcReport } => ({
      id: txHex,
      report: {
        txHex,
        rxHex: "7FF",
        title: txHex,
        safetyCritical: false,
        canSafeClear: true,
        responded,
        systemName: null,
        partNumber: null,
        diagVersion: null,
        dtcs,
        rawStatus: "",
      },
    });

    const sorted = sortSubaruScanReports([
      mkReport("765", false),
      mkReport("783", true, []),
      { id: "750" },
      mkReport("752", true, [{ code: "B1234", active: true, description: "Hist", statusByte: 0x28 }]),
      mkReport("7E0", true, [{ code: "P0102", active: true, description: "Curr", statusByte: 0x09 }]),
    ]);

    expect(sorted.map((x) => x.id)).toEqual(["7E0", "752", "783", "750", "765"]);
    expect(getSubaruBlockScanStatus(sorted[0]!.report)).toBe("current");
    expect(getSubaruBlockScanStatus(sorted[1]!.report)).toBe("history");
    expect(getSubaruBlockScanStatus(sorted[2]!.report)).toBe("no_dtc");
    expect(getSubaruBlockScanStatus(sorted[3]!.report)).toBe("unscanned");
    expect(getSubaruBlockScanStatus(sorted[4]!.report)).toBe("not_detected");
  });

  it("defines unique physical CAN targets and protects EPS/EyeSight from clearing", () => {
    const txSet = new Set(SUBARU_ALL_DTC_TARGETS.map((t) => t.tx));
    expect(txSet.size).toBe(SUBARU_ALL_DTC_TARGETS.length);
    expect(isSubaruTxSafeToClear("746")).toBe(false);
    expect(isSubaruTxSafeToClear("787")).toBe(false);
    expect(isSubaruTxSafeToClear("7E0")).toBe(true);
    expect(isSubaruTxSafeToClear("7B0")).toBe(true);
    expect(isSubaruTxSafeToClear("780")).toBe(true);
  });

  it("strictly excludes Meter, EyeSight, and Immo functions already built in /tools/subaru-coding", () => {
    const allProfiles = getAllSubaruBlockProfiles();
    expect(allProfiles.length).toBe(SSM4_FULL_SYSTEMS.length);

    const met = getSubaruBlockProfile(SSM4_FULL_SYSTEMS.find((s) => s.id === "sys-met")!);
    expect(met.workSupport.length).toBe(0);
    expect(met.activeTests.length).toBeGreaterThan(0);

    const es = getSubaruBlockProfile(SSM4_FULL_SYSTEMS.find((s) => s.id === "sys-es")!);
    expect(es.workSupport.some((w) => EXCLUDED_SUBARU_CODING_WORK_IDS.has(w.id))).toBe(false);
    expect(es.workSupport.some((w) => /selection of parameter|confirm on parameter/i.test(w.nameEn))).toBe(false);
    expect(es.workSupport.some((w) => w.id === "es-clear-alk-learning")).toBe(true);
    expect(es.workSupport.some((w) => w.id === "es-forced-heater-fan")).toBe(true);

    for (const immoId of ["sys-immb", "sys-smtc", "sys-smtp"]) {
      const p = getSubaruBlockProfile(SSM4_FULL_SYSTEMS.find((s) => s.id === immoId)!);
      expect(p.workSupport.some((w) => EXCLUDED_SUBARU_CODING_WORK_IDS.has(w.id))).toBe(false);
      expect(
        p.workSupport.some((w) => /key registration|key deletion|remote engine start|telematics cm/i.test(w.nameEn)),
      ).toBe(false);
    }
  });

  it("hides DID, PID, .srp, and 3-digit CAN addresses from user-facing labels and formatted values", () => {
    const forbiddenRe = /\b(DID|PID|7[0-9A-F]{2})\b|\.srp/i;
    for (const target of SUBARU_ALL_DTC_TARGETS) {
      expect(target.title).not.toMatch(forbiddenRe);
    }
    for (const p of getAllSubaruBlockProfiles()) {
      for (const a of p.activeTests) {
        expect(`${a.nameEn} ${a.nameRu} ${a.explanationRu}`).not.toMatch(forbiddenRe);
        for (const m of a.monitorDids) {
          expect(m.labelRu).not.toMatch(forbiddenRe);
        }
      }
      for (const w of p.workSupport) {
        expect(`${w.nameEn} ${w.nameRu} ${w.explanationRu}`).not.toMatch(forbiddenRe);
        for (const m of w.liveDids ?? []) {
          expect(m.labelRu).not.toMatch(forbiddenRe);
        }
      }
      for (const c of p.cancelCodes) {
        expect(`${c.nameEn} ${c.nameRu} ${c.explanationRu}`).not.toMatch(forbiddenRe);
      }
    }

    expect(formatSubaruUserValue([0x10, 0x17, 0x55], 0x22, "7E1")).toBe("35 °C");
    expect(formatSubaruUserValue([0x10, 0x1b, 0x30, 0x34], 0x22, "783")).toBe("12.34 В");
    expect(formatSubaruUserValue([0x10, 0x41, 0xff, 0xe2], 0x22, "746")).toBe("-3.0° (вправо)");
  });
});
