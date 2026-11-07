import { describe, expect, it } from "vitest";
import type { BleLink } from "../ble-link";
import { Elm327Client } from "../elm327";
import { executeMitsubishiServiceProcedure } from "../mitsubishi-modules";
import {
  MITSUBISHI_SERVICE_PROCEDURES,
  assertMitsubishiProcedureForEcu,
  decodeMitsubishiDieselInjectorIds21BF,
  decodeMitsubishiServiceReminder21BC,
  getMitsubishiProceduresForEcu,
} from "../mitsubishi-service-procedures";

class ScriptedServiceLink implements BleLink {
  readonly info = { id: "fake-mut", name: "fake-mut", transport: "web-bluetooth" as const };
  readonly written: string[] = [];
  private pending = "";

  constructor(private readonly responder: (cmd: string) => string) {}

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  setDisconnectListener(): void {}

  async writeLine(line: string): Promise<void> {
    this.written.push(line);
    const reply = this.responder(line.trim().toUpperCase());
    this.pending += `${reply}\r>`;
  }

  discardInput(): void {
    this.pending = "";
  }

  pullPending(): string {
    const s = this.pending;
    this.pending = "";
    return s;
  }

  async readUntilPrompt(): Promise<string> {
    const s = this.pending;
    this.pending = "";
    return s;
  }
}

describe("Mitsubishi MUT-III SE vehicle-bound service procedures", () => {
  it("exposes only procedures supported by the specific vehicle ECU SKEY and CAN address", () => {
    // Outlander III CVT8 JF016E (SKEY 30022101 on 7E1 -> 7E9)
    const cvtProcs = getMitsubishiProceduresForEcu({
      skey: "30022101",
      txCanId: "7E1",
      rxCanId: "7E9",
    });
    expect(cvtProcs.map((p) => p.id)).toEqual([
      "cvt_oil_degradation_reset_jf016e",
      "cvt_learning_reset_jf016e",
      "cvt_eop_air_bleeding",
    ]);
    // Must NOT include AT8 reset or JF011E 210D reset on JF016E SKEY 30022101
    expect(cvtProcs.some((p) => p.id === "at_learned_value_reset")).toBe(false);
    expect(cvtProcs.some((p) => p.id === "cvt_oil_degradation_reset_jf011e")).toBe(false);

    // Pajero Sport III 8AT V8AWG (SKEY 30024501 on 7E1 -> 7E9)
    const at8Procs = getMitsubishiProceduresForEcu({
      skey: "30024501",
      txCanId: "7E1",
      rxCanId: "7E9",
    });
    expect(at8Procs.map((p) => p.id)).toEqual(["at_learned_value_reset"]);
    // Must NOT include CVT oil degradation reset on 8AT!
    expect(at8Procs.some((p) => p.id.startsWith("cvt_"))).toBe(false);

    // Pajero Sport III 4N15 Diesel (SKEY 10011703 on 7E0 -> 7E8)
    const dieselProcs = getMitsubishiProceduresForEcu({
      skey: "10011703",
      txCanId: "7E0",
      rxCanId: "7E8",
    });
    expect(dieselProcs.map((p) => p.id)).toContain("diesel_injector_id_readout");
    expect(dieselProcs.map((p) => p.id)).toContain("diesel_oil_exchange_reset");
    expect(dieselProcs.map((p) => p.id)).toContain("diesel_small_injection_learning");
    expect(dieselProcs.map((p) => p.id)).toContain("diesel_dpf_service_reset");
    // Must NOT include Gasoline learned value reset (31 01 00) on Diesel 4N15!
    expect(dieselProcs.some((p) => p.id.startsWith("gas_"))).toBe(false);

    // Gasoline 6B31 / 4B12 (SKEY 10022701 on 7E0 -> 7E8)
    const gasProcs = getMitsubishiProceduresForEcu({
      skey: "10022701",
      txCanId: "7E0",
      rxCanId: "7E8",
    });
    expect(gasProcs.map((p) => p.id)).toContain("gas_learned_value_reset");
    expect(gasProcs.map((p) => p.id)).toContain("gas_fuel_pump_drive");
    expect(gasProcs.some((p) => p.id.startsWith("diesel_"))).toBe(false);
  });

  it("blocks execution if the procedure does not match the vehicle's SKEY or CAN address", () => {
    // Trying to run CVT oil degradation reset on an 8AT Pajero Sport III (SKEY 30024501)
    expect(() =>
      assertMitsubishiProcedureForEcu({
        procedureId: "cvt_oil_degradation_reset_jf016e",
        skey: "30024501",
        txCanId: "7E1",
        rxCanId: "7E9",
      }),
    ).toThrow(/не поддерживается профилем SKEY 30024501/);

    // Trying to run Diesel oil dilution reset on a Gasoline engine (SKEY 10022701)
    expect(() =>
      assertMitsubishiProcedureForEcu({
        procedureId: "diesel_oil_exchange_reset",
        skey: "10022701",
        txCanId: "7E0",
        rxCanId: "7E8",
      }),
    ).toThrow(/не поддерживается профилем SKEY 10022701/);

    // Trying to run ASC calibration on Engine CAN ID 7E0
    expect(() =>
      assertMitsubishiProcedureForEcu({
        procedureId: "asc_all_sensor_calibration",
        skey: "90422301",
        txCanId: "7E0",
        rxCanId: "7E8",
      }),
    ).toThrow(/предназначена для блока 784→785/);

    // Every registered procedure has Russian description and safety preconditions
    for (const proc of MITSUBISHI_SERVICE_PROCEDURES) {
      expect(proc.descriptionRu.length).toBeGreaterThan(30);
      expect(proc.preconditionsRu.length).toBeGreaterThan(10);
      expect(proc.supportedSkeys.length).toBeGreaterThan(0);
    }
  });

  it("executes CVT oil degradation reset (31 03) and verifies 21 0E before and after", async () => {
    let cleared = false;
    const link = new ScriptedServiceLink((cmd) => {
      if (cmd === "1092") return "50 92";
      if (cmd === "1081") return "50 81";
      if (cmd === "210E") {
        const tail = cleared ? "00 00 00 00" : "00 00 10 00"; // 4096 before -> 0 after
        return `61 0E ${"00 ".repeat(26)}${tail}`;
      }
      if (cmd === "3103") {
        cleared = true;
        return "71 03 00";
      }
      return "OK";
    });
    const elm = new Elm327Client(link);
    const res = await executeMitsubishiServiceProcedure(elm, {
      procedureId: "cvt_oil_degradation_reset_jf016e",
      skey: "30022101",
      txCanId: "7E1",
      rxCanId: "7E9",
      sleep: async () => {},
    });
    expect(res.success).toBe(true);
    expect(res.decodedSummary).toBe("Уровень деградации масла CVT (21 0E): 0");
    expect(res.steps.some((s) => s.includes("4096"))).toBe(true);
    expect(link.written).toContain("3103");
  });

  it("reads 4 × 15-byte Diesel Injector IDs from 21 BF and decodes Meter 21 BC service reminder", async () => {
    const cyl1 = "111111111111111";
    const cyl2 = "222222222222222";
    const cyl3 = "333333333333333";
    const cyl4 = "444444444444444";
    const fullAscii = `${cyl1}${cyl2}${cyl3}${cyl4}`;
    const bytes60 = Array.from(fullAscii).map((ch) => ch.charCodeAt(0));
    expect(decodeMitsubishiDieselInjectorIds21BF(bytes60)).toEqual([cyl1, cyl2, cyl3, cyl4]);

    const hex60 = bytes60.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
    const link = new ScriptedServiceLink((cmd) => {
      if (cmd === "1092") return "50 92";
      if (cmd === "21BF") return `61 BF ${hex60}`;
      if (cmd === "1081") return "50 81";
      return "OK";
    });
    const elm = new Elm327Client(link);
    const res = await executeMitsubishiServiceProcedure(elm, {
      procedureId: "diesel_injector_id_readout",
      skey: "10011701",
      txCanId: "7E0",
      rxCanId: "7E8",
      sleep: async () => {},
    });
    expect(res.success).toBe(true);
    expect(res.decodedSummary).toContain("Цил. 1: 111111111111111");
    expect(res.decodedSummary).toContain("Цил. 4: 444444444444444");

    // Meter 21 BC reminder: [0x96, 0x00, 0x0C] -> 150 * 100 = 15000 km, 12 months
    expect(decodeMitsubishiServiceReminder21BC([0x96, 0x00, 0x0c])).toEqual({
      distanceRemaining: 15000,
      monthsRemaining: 12,
    });
  });
});
