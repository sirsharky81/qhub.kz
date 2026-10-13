import { describe, expect, it } from "vitest";
import {
  LIVE_PIDS,
  decodeFuelTrimPercent,
  explainEmptyPidReadings,
  formatMode01Request,
  parseDtcsFromElmResponse,
  parseMode01Bundle,
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

describe("parseMode01Bundle", () => {
  it("reads several PIDs from one reply and ignores the next ECU", () => {
    const specs = [
      { pid: 0x0c, bytes: 2 },
      { pid: 0x0d, bytes: 1 },
      { pid: 0x04, bytes: 1 },
    ];
    const parsed = parseMode01Bundle("41 0C 1A F8 0D 00 04 5A 41 0C 00 00\r>", specs);
    expect(parsed.get(0x0c)).toEqual([0x1a, 0xf8]);
    expect(parsed.get(0x0d)).toEqual([0x00]);
    expect(parsed.get(0x04)).toEqual([0x5a]);
  });
});

describe("formatMode01Request", () => {
  it("asks ELM for a single ECU response", () => {
    expect(formatMode01Request([0x0c, 0x0d], 1)).toBe("010C0D 1");
  });
});

describe("expanded gasoline PIDs", () => {
  it("decodes timing, MAF and support for fuel level", () => {
    const timing = LIVE_PIDS.find((item) => item.pid === "010E");
    const maf = LIVE_PIDS.find((item) => item.pid === "0110");
    expect(timing?.decode([128])).toBe(0);
    expect(maf?.decode([0x01, 0x90])).toBeCloseTo(4);
    expect(pidSupported([0x00, 0x02, 0x00, 0x00], 0x2f, 0x20)).toBe(true);
  });
});
