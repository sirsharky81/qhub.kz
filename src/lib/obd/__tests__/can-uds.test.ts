import { describe, expect, it } from "vitest";
import type { BleLink } from "../ble-link";
import { framesToCsv, parseMonitorLine } from "../can-frame";
import { Elm327Client } from "../elm327";
import { ObdBleSession } from "../obd-session";
import { assessUdsRequest, exportUdsLog, parseUdsResponse } from "../uds";

class FakeLink implements BleLink {
  readonly info = { id: "fake", name: "fake", transport: "web-bluetooth" as const };
  readonly written: string[] = [];
  private pending = "";

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  setDisconnectListener(): void {}

  async writeLine(line: string): Promise<void> {
    this.written.push(line);
    if (line === "ATMA") {
      this.pending += "7E8 8 11 22 33 44 55 66 77 88\rBUFFER FULL\r";
      return;
    }
    if (line === "") {
      this.pending += "STOPPED\r>";
      return;
    }
    this.pending += "OK\r>";
  }

  discardInput(): void {
    this.pending = "";
  }

  pullPending(): string {
    const snap = this.pending;
    this.pending = "";
    return snap;
  }

  async readUntilPrompt(): Promise<string> {
    const snap = this.pending;
    this.pending = "";
    if (!snap.includes(">")) throw new Error("Таймаут ELM — нет ответа от адаптера");
    return snap;
  }
}

describe("parseMonitorLine", () => {
  it("reads a spaced frame and a compact 11-bit frame", () => {
    const spaced = parseMonitorLine("7E8 8 11 22 33 44 55 66 77 88", "6");
    expect(spaced.kind).toBe("frame");
    if (spaced.kind === "frame") {
      expect(spaced.frame.id).toBe("7E8");
      expect(spaced.frame.dlc).toBe(8);
      expect(spaced.frame.data).toEqual([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
    }
    const compact = parseMonitorLine("7E881122334455667788", "6");
    expect(compact).toEqual(spaced);
  });

  it("counts adapter losses and ignores the monitor stop line", () => {
    expect(parseMonitorLine("BUFFER FULL", "6")).toEqual({ kind: "loss", message: "BUFFER FULL" });
    expect(parseMonitorLine("CAN ERROR", "6").kind).toBe("loss");
    expect(parseMonitorLine("STOPPED", "6").kind).toBe("ignore");
  });
});

describe("framesToCsv", () => {
  it("opens as a table and keeps a note", () => {
    const csv = framesToCsv(
      [{ t: "2026-10-13T12:00:00.000Z", id: "7E8", dlc: "8", data: "11 22", note: "нажал тормоз" }],
      false,
    );
    expect(csv.startsWith("t,id,dlc,data,note\n")).toBe(true);
    expect(csv).toContain("7E8,8,11 22,нажал тормоз");
  });

  it("marks an unfinished capture", () => {
    const csv = framesToCsv([], true);
    expect(csv).toContain("незавершено: обрыв Bluetooth");
  });
});

describe("assessUdsRequest", () => {
  it("allows read services and blocks writes until developer mode", () => {
    expect(assessUdsRequest("22 F190", false).ok).toBe(true);
    expect(assessUdsRequest("10 03", false).ok).toBe(true);
    expect(assessUdsRequest("10 02", false).ok).toBe(false);
    const blocked = assessUdsRequest("2E F190 00", false);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.message).toMatch(/2E/);
    expect(assessUdsRequest("27 01", false).ok).toBe(false);
    expect(assessUdsRequest("2E F190 00", true).ok).toBe(true);
  });
});

describe("parseUdsResponse", () => {
  it("reads a positive VIN fragment and a negative response", () => {
    const vin = parseUdsResponse("62 F1 90 57 41 55 5A 5A 5A", 0x22);
    expect(vin.kind).toBe("positive");
    expect(vin.payload.slice(0, 2)).toEqual([0xf1, 0x90]);
    const nrc = parseUdsResponse("7F 22 31", 0x22);
    expect(nrc.kind).toBe("negative");
    expect(nrc.nrc).toBe(0x31);
    expect(nrc.nrcText).toMatch(/диапазона/);
    const pending = parseUdsResponse("7F 22 78", 0x22);
    expect(pending.pendingOnly).toBe(true);
    expect(pending.nrcText).toMatch(/приглашение/);
  });
});

describe("exportUdsLog", () => {
  it("writes a header", () => {
    const csv = exportUdsLog([
      { t: "t", tx: "7E0", rx: "7E8", request: "22 F190", response: "62 F190" },
    ]);
    expect(csv.startsWith("t,tx,rx,request,response\n")).toBe(true);
  });
});

describe("CAN monitor stream", () => {
  it("reads ATMA lines before the prompt and stops through the queue", async () => {
    const link = new FakeLink();
    const elm = new Elm327Client(link);
    const lines: string[] = [];
    await elm.startMonitor((line) => lines.push(line));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(lines).toContain("7E8 8 11 22 33 44 55 66 77 88");
    expect(lines).toContain("BUFFER FULL");
    await expect(elm.sendCommand("ATI")).rejects.toThrow(/монитор/);
    await elm.stopMonitor();
    expect(elm.isMonitoring).toBe(false);
    expect(link.written).toContain("ATMA");
    expect(link.written).toContain("");
    await expect(elm.sendCommand("ATI")).resolves.toMatch(/OK/);
  });
});

describe("sendUds gate", () => {
  it("refuses a write service before the adapter is involved", async () => {
    const session = new ObdBleSession();
    await expect(session.sendUds("6", "7E0", "7E8", "2E F190 00", false)).rejects.toThrow(/2E/);
    await expect(session.sendUds("6", "7E0", "7E8", "27 01", false)).rejects.toThrow(/27/);
  });
});
