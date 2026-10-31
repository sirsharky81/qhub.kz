import { describe, expect, it } from "vitest";
import { decodeSubaruEpsSteeringAngleDeg } from "../subaru-steering-calibration";

describe("subaru-steering-calibration", () => {
  it("decodes EPS steering angle from two bytes", () => {
    expect(decodeSubaruEpsSteeringAngleDeg([0x00, 0x19])).toBe(2.5);
    expect(decodeSubaruEpsSteeringAngleDeg([0xff, 0xe2])).toBe(-3);
    expect(decodeSubaruEpsSteeringAngleDeg([0x00, 0x00])).toBe(0);
  });
});
