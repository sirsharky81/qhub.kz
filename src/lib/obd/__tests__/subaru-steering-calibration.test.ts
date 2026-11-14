import { describe, expect, it } from "vitest";
import type { Elm327Client } from "../elm327";
import {
  SUBARU_SERVICE_ACTIONS,
  decodeSubaruEpsSteeringAngleDeg,
  executeSubaruUdsProcedure,
} from "../subaru-steering-calibration";

describe("subaru-steering-calibration", () => {
  it("decodes EPS steering angle from two bytes", () => {
    expect(decodeSubaruEpsSteeringAngleDeg([0x00, 0x19])).toBe(2.5);
    expect(decodeSubaruEpsSteeringAngleDeg([0xff, 0xe2])).toBe(-3);
    expect(decodeSubaruEpsSteeringAngleDeg([0x00, 0x00])).toBe(0);
  });

  it("defines executable calibration, adaptation, and reset actions across Subaru ECUs", () => {
    expect(SUBARU_SERVICE_ACTIONS.map((a) => a.id)).toEqual([
      "vdc-steering-zero",
      "ecm-Clear-learned",
      "ecm-avcs-learning",
      "ecm-injector-check",
      "ecm-dpf-gpf-reset",
      "tcm-at-learning-clear",
      "tcm-at-learning-start",
      "epb-pad-release",
      "epb-pad-return",
      "epb-stroke-cal",
      "ebb-air-bleeding",
      "eyesight-camera-check",
      "eyesight-precrash-history",
      "meter-read-variant",
      "immo-key-count-check",
      "tpms-read-id-status",
      "iss-battery-reset",
      "ac-flap-init",
      "dms-seat-memory-read",
      "rab-sonar-history",
      "srh-headlight-zero",
      "cgw-unlock-mac-check",
      "fcr-bsd-radar-cal",
      "avn-headunit-diag",
      "tlm-dcm-diag",
    ]);
  });

  it("queries SGP TCM 7A3 when 7E1 procedure is invoked on 2022+ SGP vehicles", async () => {
    let activeTx = "";
    const seen: string[] = [];
    const fakeElm = {
      async sendCommand() {
        return "OK";
      },
      async setCanHeader(tx: number) {
        activeTx = tx.toString(16).toUpperCase();
      },
      async sendPayload(hex: string) {
        const key = hex.replace(/\s+/g, "").toUpperCase();
        seen.push(`${activeTx}:${key}`);
        if (activeTx === "7A3") {
          if (key === "1003") return "50 03";
          if (key === "1001") return "50 01";
          if (key === "3E00") return "7E 00";
          if (key === "2210D2") return "62 10 D2 5F";
        }
        return "NO DATA";
      },
    } as unknown as Elm327Client;

    const res = await executeSubaruUdsProcedure(fakeElm, {
      txHex: "7E1",
      rxHex: "7E9",
      payloads: ["2210D2"],
      stopOnWriteSuccess: false,
    });

    expect(res.success).toBe(true);
    expect(res.decodedSummaries).toContain("45 °C");
    expect(seen).toContain("7A3:2210D2");
  });
});
