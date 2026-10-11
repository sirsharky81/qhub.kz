import { describe, expect, it } from "vitest";
import { parseDtcsFromElmResponse, parseMode01Pid } from "../obd2";

describe("parseDtcsFromElmResponse", () => {
  it("parses standard 43 response", () => {
    const raw = "43 02 01 33 00 00 \r\n>";
    const dtcs = parseDtcsFromElmResponse(raw);
    expect(dtcs.length).toBe(1);
    expect(dtcs[0]?.code).toMatch(/^P0133$/);
  });
});

describe("parseMode01Pid", () => {
  it("extracts RPM bytes", () => {
    const raw = "04 41 0C 1A F8 \r\n>";
    const bytes = parseMode01Pid(raw, 0x0c);
    expect(bytes).toEqual([0x1a, 0xf8]);
  });
});
