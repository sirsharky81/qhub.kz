import { describe, expect, it } from "vitest";
import { EXTRA_PIDS, pidApplies, tilesFromPid, type PidDef } from "../pids";

function def(pid: string): PidDef {
  const found = EXTRA_PIDS.find((item) => item.pid === pid);
  if (!found) throw new Error(`missing ${pid}`);
  return found;
}

function bitmapFor(base: number, pid: number): number[] {
  const bytes = [0, 0, 0, 0];
  const bitIndex = pid - base - 1;
  bytes[bitIndex >> 3] = 1 << (7 - (bitIndex & 7));
  return bytes;
}

describe("extra Mode 01 registry", () => {
  it("decodes every priority-1 PID from reference bytes", () => {
    expect(def("018E").decode([150])).toBe(25);
    expect(def("018E").decode([125])).toBe(0);
    expect(def("019D").decode([0x01, 0xf4, 0x00, 0x00])).toBe(10);
    expect(def("01A2").decode([0x02, 0x00])).toBe(16);
    expect(def("01A4").decode([0x00, 0x00, 0x03, 0xe8])).toBeNull();
    expect(def("01A4").decode([0x02, 0x00, 0x03, 0xe8])).toBe(1);
    expect(def("01A6").decode([0x00, 0x01, 0x86, 0xa0])).toBe(10_000);
  });

  it("decodes boost sensor 1 as 0.03125 kPa per bit", () => {
    const bytes = [0, 0, 0, 0x03, 0xe8, 0, 0, 0, 0, 0];
    expect(def("0170").decode(bytes)).toBeCloseTo(31.25);
  });

  it("decodes only the EGT sensors the support byte names", () => {
    const bytes = [0x01, 0x02, 0x58, 0, 0, 0, 0, 0, 0];
    expect(def("0178").decode(bytes)).toEqual([20, Number.NaN, Number.NaN, Number.NaN]);
    expect(tilesFromPid(def("0178"), bytes)).toEqual([
      { label: "Температура выхлопа, банк 1 · 1", unit: "°C", digits: 0, value: 20 },
    ]);
    expect(def("0178").decode([0x00, 0x02, 0x58, 0, 0, 0, 0, 0, 0])).toBeNull();
    expect(tilesFromPid(def("0178"), [0x00, 0x02, 0x58, 0, 0, 0, 0, 0, 0])).toEqual([]);
  });

  it("keeps both languages and does not invent an unpublished exhaust-flow scale", () => {
    for (const item of EXTRA_PIDS) {
      expect(item.name_ru.length).toBeGreaterThan(0);
      expect(item.name_kk.length).toBeGreaterThan(0);
    }
    expect(EXTRA_PIDS.some((item) => item.pid === "019E")).toBe(false);
  });

  it("hides a PID the ECU did not declare and diesel tiles on gasoline", () => {
    const maps = new Map<number, number[]>();
    expect(pidApplies(def("018E"), "gasoline", maps)).toBe(false);
    maps.set(0x80, bitmapFor(0x80, 0x8e));
    expect(pidApplies(def("018E"), "gasoline", maps)).toBe(true);

    maps.set(0x60, bitmapFor(0x60, 0x78));
    expect(pidApplies(def("0178"), "gasoline", maps)).toBe(false);
    expect(pidApplies(def("0178"), "diesel", maps)).toBe(true);
    expect(pidApplies(def("0178"), null, maps)).toBe(false);
  });
});
