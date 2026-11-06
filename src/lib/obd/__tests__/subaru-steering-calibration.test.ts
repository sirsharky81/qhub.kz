import { describe, expect, it } from "vitest";
import {
  SUBARU_SERVICE_ACTIONS,
  decodeSubaruEpsSteeringAngleDeg,
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
});
