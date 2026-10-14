import { describe, expect, it } from "vitest";
import {
  LIVE_PIDS,
  decodeFuelTrimPercent,
  explainEmptyPidReadings,
  formatMode01Request,
  parseDtcsFromElmResponse,
  freezeFrameDtc,
  parseMode01Bundle,
  parseMode01Pid,
  parseMode02Pid,
  parseMode09Ascii,
  parseMode09Cvn,
  parseReadiness,
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

describe("extra OBD modes", () => {
  it("reads a freeze-frame PID and its DTC", () => {
    expect(parseMode02Pid("42 0C 00 1A F8", 0x0c)).toEqual([0x1a, 0xf8]);
    expect(freezeFrameDtc(parseMode02Pid("42 02 00 01 33", 0x02))).toBe("P0133");
    expect(freezeFrameDtc([0, 0])).toBeNull();
  });

  it("reads readiness for a gasoline ECU", () => {
    const report = parseReadiness("41 01 83 07 FF 00");
    expect(report?.mil).toBe(true);
    expect(report?.dtcCount).toBe(3);
    expect(report?.ignition).toBe("бензин");
    expect(report?.lines).toContain("Катализатор: готово");
    expect(report?.lines).toContain("Пропуски воспламенения: готово");
  });

  it("reads VIN and calibration checksum from mode 09", () => {
    const vinBytes = [0x49, 0x02, 0x01, ...Array.from("JMBXTGF3WCJ000001", (char) => char.charCodeAt(0))];
    const vin = vinBytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(parseMode09Ascii(vin, 0x02)).toBe("JMBXTGF3WCJ000001");
    expect(parseMode09Cvn("49 06 01 12 34 56 78")).toBe("12345678");
  });

  it("ignores ELM line numbers when they would shift the VIN nibbles", () => {
    const raw = "014\r0: 49 02 01 34 53 34\r1: 42 54 47 55 44 31 52\r2: 33 32 37 30 32 32 33\r>";
    expect(parseMode09Ascii(raw, 0x02)).toBe("4S4BTGUD1R3270223");
  });

  it("still joins mode 09 segments that are not ELM line indexes", () => {
    const raw = ["49020134533442", "49020254475544", "49020331523332", "49020437303232", "49020533"].join("\r");
    expect(parseMode09Ascii(raw, 0x02)).toBe("4S4BTGUD1R3270223");
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

  it("keeps each 41 line from the same ECU and stops when a PID repeats", () => {
    const specs = [
      { pid: 0x0c, bytes: 2 },
      { pid: 0x0d, bytes: 1 },
      { pid: 0x04, bytes: 1 },
      { pid: 0x11, bytes: 1 },
    ];
    const parsed = parseMode01Bundle("41 0C 1A F8\r41 0D 00\r41 04 5A\r41 11 20\r41 0C 00 00\r>", specs);
    expect(parsed.get(0x0c)).toEqual([0x1a, 0xf8]);
    expect(parsed.get(0x0d)).toEqual([0x00]);
    expect(parsed.get(0x04)).toEqual([0x5a]);
    expect(parsed.get(0x11)).toEqual([0x20]);
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
