import { describe, expect, it } from "vitest";
import type { BleLink } from "../ble-link";
import { framesToCsv, parseMonitorLine } from "../can-frame";
import { Elm327Client } from "../elm327";
import { ObdBleSession } from "../obd-session";
import { EXTENDED_COMMANDS, decodeExtendedSignals } from "../extended-signals";
import { ETACS_PROFILES, positiveEtacsPayload, readEtacsCoding } from "../mitsubishi-etacs";
import {
  assessUdsRequest,
  decodeUdsDidSupportBitmap,
  describeCanModule,
  diffSubaruDumps,
  exportUdsLog,
  formatUdsPayload,
  parseTaggedUdsReplies,
  parseUdsDtcs1902,
  parseUdsResponse,
  resolveDidLabel,
  summarizeNumericUdsBytes,
} from "../uds";

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
    expect(assessUdsRequest("21 01", false).ok).toBe(true);
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
    const hidden = parseUdsResponse("7E8037F2231", 0x22);
    expect(hidden.kind).toBe("negative");
    expect(hidden.nrc).toBe(0x31);
    const coolant = parseUdsResponse("E85F", 0xa8);
    expect(coolant.kind).toBe("positive");
    expect(coolant.payload).toEqual([0x5f]);
    expect(nrc.nrcText).toMatch(/диапазона/);
    const pending = parseUdsResponse("7F 22 78", 0x22);
    expect(pending.pendingOnly).toBe(true);
    expect(pending.nrcText).toMatch(/приглашение/);
  });

  it("strips ELM multiline indexes and trims trailing ISO-TP padding", () => {
    const raw =
      "014\r0: 62 F1 90 57 41 55\r1: 5A 5A 5A 34 42 30\r2: 4E 30 30 30 30 30 31\r3: 32 33 00 00 00 00 00\r>";
    const parsed = parseUdsResponse(raw, 0x22);
    expect(parsed.kind).toBe("positive");
    expect(parsed.payload.slice(0, 2)).toEqual([0xf1, 0x90]);
    expect(parsed.payload.length).toBe(0x14 - 1);
  });

  it("identifies responding ECU CAN IDs from ATH1 ATS1 scan replies", () => {
    const raw = "7E8 02 7E 00\r7E9 03 7F 3E 11\r7A0 02 7E 00\r>";
    const replies = parseTaggedUdsReplies(raw, 0x3e);
    expect(replies.map((item) => item.rxAddress)).toEqual([0x7e8, 0x7e9, 0x7a0]);
    expect(replies[0]?.parsed.kind).toBe("positive");
    expect(replies[1]?.parsed.kind).toBe("negative");
    expect(describeCanModule(0x7e8)?.txHex).toBe("7E0");
    expect(describeCanModule(0x7a0)?.txHex).toBe("7A1");
  });
});

describe("Mitsubishi ETACS .kon / .cuf dump", () => {
  it("strips ELM multiline framing and trailing padding from 21 30 / 21 31", () => {
    const raw =
      "00A\r0: 61 30 11 22 33 44\r1: 55 66 77 88 AA AA AA\r>";
    const bytes = positiveEtacsPayload(raw, 0x21, [0x30]);
    expect(Array.from(bytes ?? [])).toEqual([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
  });

  it("reads .kon and .cuf without disabling ISO-TP (ATCAF0)", async () => {
    const link = new FakeLink();
    const origWrite = link.writeLine.bind(link);
    link.writeLine = async (line: string) => {
      if (line === "2130" || line === "21 30") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "006\r0: 61 30 A1 B2 C3 D4 00\r>";
        return;
      }
      if (line === "2131" || line === "21 31") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "005\r0: 61 31 01 02 03 00 00\r>";
        return;
      }
      if (line === "2180" || line === "21 80") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "61 80 38 36 33 37 41 36 34 35\r>";
        return;
      }
      await origWrite(line);
    };
    const elm = new Elm327Client(link);
    const dump = await readEtacsCoding(elm, ETACS_PROFILES[1]!);
    expect(link.written).not.toContain("ATCAF0");
    expect(Array.from(dump.variant)).toEqual([0xa1, 0xb2, 0xc3, 0xd4]);
    expect(Array.from(dump.custom)).toEqual([0x01, 0x02, 0x03]);
    expect(dump.partNumber).toBe("8637A645");
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

describe("extended signal lists", () => {
  it("decodes a Triton 21 01 frame and keeps write services blocked", () => {
    const command = EXTENDED_COMMANDS.find((item) => item.hex === "21 01");
    expect(command).toBeTruthy();
    const decoded = decodeExtendedSignals(command!, [0x01, 0xaf, 0x00, 0x00, 0x68, 0x41]);
    expect(decoded.map((row) => row.value)).toEqual(["12.4", "0", "13", "510"]);
    expect(EXTENDED_COMMANDS.some((item) => item.hex.startsWith("22") && item.tx === "DA15")).toBe(false);
    expect(assessUdsRequest("A8 00 00 00 08", false).ok).toBe(true);
    expect(assessUdsRequest("B8 00 00 00 08", false).ok).toBe(false);
    const coolant = EXTENDED_COMMANDS.find((item) => item.hex === "A8 00 00 00 08");
    expect(decodeExtendedSignals(coolant!, [0x5f]).map((row) => row.value)).toEqual(["55"]);
    const clutch = EXTENDED_COMMANDS.find((item) => item.label === "Сцепление");
    const brake = EXTENDED_COMMANDS.find((item) => item.label === "Тормоз");
    expect(decodeExtendedSignals(clutch!, [0x88])[0]?.value).toBe("вкл");
    expect(decodeExtendedSignals(brake!, [0x00])[0]?.value).toBe("выкл");
    expect(assessUdsRequest("2E F190 00", false).ok).toBe(false);
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

  it("forgets the CAN header when entering UDS so the next request sets ATSH", async () => {
    const link = new FakeLink();
    const elm = new Elm327Client(link);
    await elm.setCanHeader(0x7e0, 0x7e8);
    await elm.useUdsProfile("6");
    expect(link.written).toContain("ATH0");
    expect(link.written).toContain("ATAR");
    const mark = link.written.length;
    await elm.setCanHeader(0x7e0);
    expect(link.written.slice(mark)).toContain("ATSH7E0");
    expect(link.written.slice(mark).some((line) => line.startsWith("ATCRA"))).toBe(false);
  });
});

describe("sendUds gate", () => {
  it("refuses a write service before the adapter is involved", async () => {
    const session = new ObdBleSession();
    await expect(session.sendUds("6", "7E0", "7E8", "2E F190 00", false)).rejects.toThrow(/2E/);
    await expect(session.sendUds("6", "7E0", "7E8", "27 01", false)).rejects.toThrow(/27/);
  });

  it("summarizes numeric UDS sensor bytes and maps Subaru SGP CAN modules", () => {
    expect(describeCanModule(0x7c0).name).toContain("Приборная");
    expect(describeCanModule(0x784).name).toContain("EyeSight");
    const summary = summarizeNumericUdsBytes([0x00, 0x78], "00 78");
    expect(summary).toContain("16бит=120");
    const formatted = formatUdsPayload([0x10, 0x01, 0x82], 0x22);
    expect(formatted).toContain("число=130");
    expect(formatted).toContain("темп=90°C");

    // Subaru SGP Meter 783 bitmap 22 1000 -> 06 00 00 F5
    const meterSupported = decodeUdsDidSupportBitmap(0x1000, [0x06, 0x00, 0x00, 0xf5]);
    expect(meterSupported).toEqual([0x1006, 0x1007, 0x1019, 0x101a, 0x101b, 0x101c, 0x101e, 0x1020]);
    const bitmapText = formatUdsPayload([0x10, 0x00, 0x06, 0x00, 0x00, 0xf5], 0x22);
    expect(bitmapText).toContain("1019");
    expect(bitmapText).toContain("1020");

    // ATH1 multi-frame ISO-TP response on 74E (Power Steering System)
    const ath1EpsRaw = [
      "74E 10 18 62 F1 97 50 6F 77",
      "74E 21 65 72 20 53 74 65 65",
      "74E 22 72 69 6E 67 20 53 79",
      "74E 23 73 74 65 6D 20 20 20",
    ].join("\r");
    const epsParsed = parseUdsResponse(ath1EpsRaw, 0x22);
    expect(epsParsed.kind).toBe("positive");
    expect(formatUdsPayload(epsParsed.payload, 0x22)).toContain("Power Steering System");

    // 101B voltage (14.40 V) and 101E ignition timer
    expect(formatUdsPayload([0x10, 0x1b, 0x38, 0x45], 0x22)).toContain("14.40 В (14405 мВ)");
    expect(formatUdsPayload([0x10, 0x1e, 0x0b, 0x47, 0x00, 0x00, 0x05, 0xab], 0x22)).toContain("145.1 с");

    // Diff between two Subaru SGP JSON dumps
    const diffs = diffSubaruDumps(
      {
        modules: [
          {
            txHex: "752",
            title: "BIU / TPMS",
            dids: [
              { did: "1021", label: "DID 1021", hex: "A4", decoded: "A4" },
              { did: "110B", label: "DID 110B", hex: "FF", decoded: "FF" },
            ],
          },
        ],
      },
      {
        modules: [
          {
            txHex: "752",
            title: "BIU / TPMS",
            dids: [
              { did: "1021", label: "DID 1021", hex: "A4", decoded: "A4" },
              { did: "110B", label: "DID 110B", hex: "00", decoded: "00" },
            ],
          },
        ],
      },
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.did).toBe("110B");
    expect(diffs[0]?.beforeHex).toBe("FF");
    expect(diffs[0]?.afterHex).toBe("00");
  });

  it("resolves module-scoped DID labels, steering angle on 746, and blocks DTC clearing on safety modules", async () => {
    expect(resolveDidLabel("1041", "746")).toContain("Угол поворота рулевого колеса");
    expect(resolveDidLabel("1041", "783")).toContain("Датчик уровня топлива");
    expect(resolveDidLabel("1042", "7B0")).toContain("Клапаны / статус тормозного контура");

    // 746 DID 1041: 0x0019 = +2.5°, 0xFFE2 = -3.0°, 0x0000 = 0.0°
    expect(formatUdsPayload([0x10, 0x41, 0x00, 0x19], 0x22, "746")).toContain("+2.5°");
    expect(formatUdsPayload([0x10, 0x41, 0xff, 0xe2], 0x22, "746")).toContain("-3.0°");
    expect(formatUdsPayload([0x10, 0x41, 0x00, 0x00], 0x22, "746")).toContain("0.0°");

    // 752 DID 1021: 0xA4 = 2.26 bar (32.8 PSI)
    expect(formatUdsPayload([0x10, 0x21, 0xa4], 0x22, "752")).toContain("2.26 бар");

    // 783 DID 1041: 0x52 (82/255 = 32%)
    expect(formatUdsPayload([0x10, 0x41, 0x52], 0x22, "783")).toContain("32%");

    // UDS 19 02 DTC payload: [0x02, 0xFF, 0x01, 0x71, 0x00, 0x2F] -> P0171
    const dtcs = parseUdsDtcs1902([0x02, 0xff, 0x01, 0x71, 0x00, 0x2f]);
    expect(dtcs).toHaveLength(1);
    expect(dtcs[0]?.code).toBe("P0171");
    expect(dtcs[0]?.statusByte).toBe(0x2f);
    expect(dtcs[0]?.active).toBe(true);

    // Safety modules (SRS 780, ABS/VDC 7B0, EPS 746, EyeSight 787) must refuse DTC clearing
    const session = new ObdBleSession();
    for (const blockedTx of ["780", "7B0", "746", "787"]) {
      await expect(session.clearModuleDtcsSafe("6", blockedTx, "788")).rejects.toThrow(/заблокирован/i);
    }
  });
});

