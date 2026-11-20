import { describe, expect, it } from "vitest";
import {
  SUBARU_METER_A0XX_META_LIST,
  decodeSubaruMeterA0xxByte,
  detectSubaruMeterPanelKind,
  getMeterPanelDidSpecList,
} from "../subaru-meter-did-dictionary";

describe("subaru-meter-did-dictionary", () => {
  it("covers all 44 A0xx DIDs with SSM4 names and RU titles", () => {
    expect(SUBARU_METER_A0XX_META_LIST).toHaveLength(44);
    const a011 = SUBARU_METER_A0XX_META_LIST.find((d) => d.did === "A011");
    expect(a011?.ssm4NameEn).toBe("TPMS presence information");
    const a02d = SUBARU_METER_A0XX_META_LIST.find((d) => d.did === "A02D");
    expect(a02d?.ssm4NameEn).toBe("Vehicle Grade Presence Information");
  });

  it("detects exact Meter Panel Kind across all 8 Subaru SSM4 panel families", () => {
    expect(
      detectSubaruMeterPanelKind({
        appliedModel: "BTACYR8",
        activeDids: ["A002", "A011", "A02D"],
      }).panelKind,
    ).toBe("bt-bw-early");
    expect(
      detectSubaruMeterPanelKind({
        appliedModel: "BTADYR8",
        activeDids: ["A002", "A036", "A02E"],
      }).panelKind,
    ).toBe("bt-bw-wm-facelift");
    expect(
      detectSubaruMeterPanelKind({
        appliedModel: "GU7AL1",
        activeDids: ["A003"],
      }).panelKind,
    ).toBe("gu-crosstrek");
    expect(
      detectSubaruMeterPanelKind({
        appliedModel: "VBHAJ8",
        activeDids: ["A002", "A02A"],
      }).panelKind,
    ).toBe("vb-vn-wrx");
    expect(
      detectSubaruMeterPanelKind({
        appliedModel: "ZD8B2E8",
        activeDids: ["A002", "A00B"],
      }).panelKind,
    ).toBe("zd8-zn8-brz");
    expect(
      detectSubaruMeterPanelKind({
        appliedModel: "SK9BL2L",
        activeDids: ["A001", "A00D"],
      }).panelKind,
    ).toBe("sk-forester");
    expect(
      detectSubaruMeterPanelKind({
        appliedModel: "GT7EL9L",
        activeDids: ["A001", "A021"],
      }).panelKind,
    ).toBe("gk-gt-late");
    expect(
      detectSubaruMeterPanelKind({
        appliedModel: "GT7BL9C",
        activeDids: ["A001", "A013", "A018"],
      }).panelKind,
    ).toBe("gk-gt-early");
  });

  it("returns panel-scoped SSM4 values from cgdw for each panel kind", () => {
    const btEarly = getMeterPanelDidSpecList({
      panelKind: "bt-bw-early",
      appliedModel: "BTACYR8",
    });
    const a002Bt = btEarly.find((s) => s.meta.did === "A002");
    expect(a002Bt?.options.some((v) => v.hex === "03")).toBe(true);
    expect(a002Bt?.options.some((v) => v.hex === "02")).toBe(true);
    const a011Bt = btEarly.find((s) => s.meta.did === "A011");
    expect(a011Bt?.options.map((v) => v.hex)).toEqual(["00", "FF"]);
    expect(btEarly.some((s) => s.meta.did === "A001")).toBe(false);

    const skSpecs = getMeterPanelDidSpecList({ panelKind: "sk-forester" });
    expect(skSpecs.find((s) => s.meta.did === "A001")?.options.some((v) => v.hex === "04")).toBe(
      true,
    );
    expect(skSpecs.some((s) => s.meta.did === "A02D")).toBe(false);

    const allSpecs = getMeterPanelDidSpecList({
      panelKind: "bt-bw-early",
      includeAllCatalogDids: true,
    });
    expect(allSpecs).toHaveLength(44);
  });

  it("decodes dual-nibble A007/A021 and presence/destination bytes accurately", () => {
    expect(decodeSubaruMeterA0xxByte("A007", "30", "bt-bw-early")).toContain("Gravel");
    expect(decodeSubaruMeterA0xxByte("A007", "15", "vb-vn-wrx")).toContain("3 modes");
    expect(decodeSubaruMeterA0xxByte("A021", "11", "bt-bw-early")).toContain("CAN");
    expect(decodeSubaruMeterA0xxByte("A011", "FF", "bt-bw-early")).toContain("TPMS");
    expect(decodeSubaruMeterA0xxByte("A011", "00", "bt-bw-early")).toContain("No function");
    expect(decodeSubaruMeterA0xxByte("A02D", "01", "bt-bw-early")).toContain("WILDERNESS");
    expect(decodeSubaruMeterA0xxByte("A024", "02", "bt-bw-early")).toContain("6SP");
  });
});
