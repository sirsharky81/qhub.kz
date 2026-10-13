import { describe, expect, it } from "vitest";
import {
  decodeFuelTrimPercent,
  explainEmptyPidReadings,
  parseDtcsFromElmResponse,
  parseMode01Pid,
  pidSupported,
} from "../obd2";

describe("parseDtcsFromElmResponse", () => {
  it("parses standard 43 response", () => {
    const raw = "43 02 01 33 00 00 \r\n>";
    const dtcs = parseDtcsFromElmResponse(raw);
    expect(dtcs.length).toBe(1);
    expect(dtcs[0]?.code).toMatch(/^P0133$/);
  });
});

describe("decodeFuelTrimPercent", () => {
  it("decodes zero trim at 128", () => {
    expect(decodeFuelTrimPercent([128])).toBe(0);
  });

  it("decodes positive trim", () => {
    expect(decodeFuelTrimPercent([136])).toBeCloseTo(6.25, 2);
  });
});

describe("parseMode01Pid", () => {
  it("extracts RPM bytes", () => {
    const raw = "04 41 0C 1A F8 \r\n>";
    const bytes = parseMode01Pid(raw, 0x0c);
    expect(bytes).toEqual([0x1a, 0xf8]);
  });

  it("reads a compact ATS0 response", () => {
    expect(parseMode01Pid("410C1AF8\r>", 0x0c)).toEqual([0x1a, 0xf8]);
  });

  it("reads a compact CAN header (ATH1 ATS0)", () => {
    expect(parseMode01Pid("7E806410C1AF8\r>", 0x0c)).toEqual([0x1a, 0xf8]);
  });

  it("reads a spaced CAN header", () => {
    expect(parseMode01Pid("7E8 06 41 0C 1A F8\r>", 0x0c)).toEqual([0x1a, 0xf8]);
  });
});

describe("pidSupported", () => {
  it("reads the 0100 bitmap", () => {
    const bitmap = [0xbe, 0x3f, 0xa8, 0x13];
    expect(pidSupported(bitmap, 0x0c)).toBe(true);
    expect(pidSupported(bitmap, 0x0d)).toBe(true);
    expect(pidSupported(bitmap, 0x02)).toBe(false);
  });
});

describe("explainEmptyPidReadings", () => {
  it("explains NO DATA", () => {
    expect(explainEmptyPidReadings(["NO DATA\r>"])).toMatch(/NO DATA/);
  });
});
