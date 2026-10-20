import { describe, expect, it } from "vitest";
import type { BleLink } from "../ble-link";
import { framesToCsv, parseMonitorLine } from "../can-frame";
import { Elm327Client } from "../elm327";
import { ObdBleSession } from "../obd-session";
import { EXTENDED_COMMANDS, decodeExtendedSignals } from "../extended-signals";
import {
  ETACS_PROFILES,
  crc16X25Ascii,
  formatMutCodingContainer,
  parseMitsubishiCodingFileBytes,
  positiveEtacsPayload,
  readEtacsCoding,
  writeEtacsSingleBlock,
} from "../mitsubishi-etacs";
import {
  calibrateMitsubishiSasZero,
  decodeCanBroadcastFrame,
  decodeMitsubishiAt2102And2104,
  decodeMitsubishiCvt,
  decodeMitsubishiTpmsPayload,
  diffCanBusSnapshots,
  readMitsubishiMeter,
  readMitsubishiSteeringAngle,
  readMitsubishiTransmission,
  readTpmsSensors,
} from "../mitsubishi-modules";
import {
  assessUdsRequest,
  decodeUdsDidSupportBitmap,
  describeCanModule,
  diffSubaruDumps,
  exportUdsLog,
  formatUdsPayload,
  parseKwpDtcs18,
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

  it("preserves 21 30 (.kon) on 620/504 even when 21 31 (.cuf) returns 7F 21 12", async () => {
    const link = new FakeLink();
    const origWrite = link.writeLine.bind(link);
    link.writeLine = async (line: string) => {
      if (line === "2130" || line === "21 30") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "006\r0: 61 30 DE AD BE EF 00\r>";
        return;
      }
      if (/^21(31|32|43|51|40|52|B1)$/.test(line)) {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "7F 21 12\r>";
        return;
      }
      await origWrite(line);
    };
    const elm = new Elm327Client(link);
    const p620 = ETACS_PROFILES.find((p) => p.id === "620-504")!;
    const dump = await readEtacsCoding(elm, p620);
    expect(dump.txHex).toBe("620");
    expect(dump.rxHex).toBe("504");
    expect(Array.from(dump.variant)).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect(dump.custom.length).toBe(0);
    expect(dump.customStatusNote).toMatch(/\.kon/);
    expect(link.written).toContain("ATFCSH620");
    expect(link.written).toContain("ATFCSM1");
  });

  it("reads Mitsubishi Engine ECU (7E0 -> 7E8) .kon coding and 1860xxxx part number", async () => {
    const link = new FakeLink();
    const origWrite = link.writeLine.bind(link);
    link.writeLine = async (line: string) => {
      if (line === "2130" || line === "21 30") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "7F 21 12\r>";
        return;
      }
      if (line === "2132" || line === "21 32") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "006\r0: 61 32 10 20 30 40 00\r>";
        return;
      }
      if (line === "2180" || line === "21 80") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "61 80 31 38 36 30 43 39 39 31\r>";
        return;
      }
      if (/^21(31|43|51|40|52|B1)$/.test(line)) {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "7F 21 12\r>";
        return;
      }
      await origWrite(line);
    };
    const elm = new Elm327Client(link);
    const engineProfile = ETACS_PROFILES.find((p) => p.id === "engine-auto")!;
    const dump = await readEtacsCoding(elm, engineProfile);
    expect(dump.moduleKind).toBe("engine");
    expect(dump.txHex).toBe("7E0");
    expect(dump.rxHex).toBe("7E8");
    expect(dump.variantUsedId).toBe("21 32");
    expect(Array.from(dump.variant)).toEqual([0x10, 0x20, 0x30, 0x40]);
    expect(dump.partNumber).toBe("1860C991");
  });

  it("writes .kon (3B 30) and .cuf (3B 31) separately and verifies each block", async () => {
    const link = new FakeLink();
    const origWrite = link.writeLine.bind(link);
    let currentVariant = "A1 B2 C3 D4";
    let currentCustom = "00 00 00";

    link.writeLine = async (line: string) => {
      if (line.startsWith("3B30")) {
        link.written.push(line);
        // Simulate ECU writing .kon and resetting .cuf to factory defaults (FF FF FF)
        currentVariant = "11 22 33 44";
        currentCustom = "FF FF FF";
        (link as unknown as { pending: string }).pending += "7B 30\r>";
        return;
      }
      if (line === "2130") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += `61 30 ${currentVariant}\r>`;
        return;
      }
      if (line.startsWith("3B31")) {
        link.written.push(line);
        currentCustom = "05 06 07";
        (link as unknown as { pending: string }).pending += "7B 31\r>";
        return;
      }
      if (line === "2131") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += `61 31 ${currentCustom}\r>`;
        return;
      }
      await origWrite(line);
    };

    const elm = new Elm327Client(link);
    const p620 = ETACS_PROFILES.find((p) => p.id === "620-504")!;

    // Step 1: Write only .kon
    const konParsed = parseMitsubishiCodingFileBytes(
      new Uint8Array([0x11, 0x22, 0x33, 0x44]),
      "kon",
      "test.kon",
    );
    const konRes = await writeEtacsSingleBlock(elm, {
      profile: p620,
      kind: "kon",
      payload: konParsed.payload,
    });
    expect(konRes.writeCommandHex).toBe("3B 30");
    expect(konRes.verified).toBe(true);
    expect(konRes.note).toMatch(/сбрасывает настройки \.cuf/);
    // Ensure 3B31 was NOT sent during Step 1
    expect(link.written.some((cmd) => cmd.startsWith("3B31"))).toBe(false);

    // Step 2: Write only .cuf separately to restore custom settings
    const cufRes = await writeEtacsSingleBlock(elm, {
      profile: p620,
      kind: "cuf",
      payload: new Uint8Array([0x05, 0x06, 0x07]),
    });
    expect(cufRes.writeCommandHex).toBe("3B 31");
    expect(cufRes.verified).toBe(true);
    expect(link.written).toContain("3B31050607");
  });

  it("skips 1-byte 21 30 status (02) on ETACS 8637C671 in favor of multi-byte 21 52 / 21 42", async () => {
    const link = new FakeLink();
    const origWrite = link.writeLine.bind(link);
    link.writeLine = async (line: string) => {
      if (line === "2130") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "61 30 02\r>";
        return;
      }
      if (line === "2152") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "008\r0: 61 52 11 22 33 44\r1: 55 66 00 00\r>";
        return;
      }
      if (line === "2132") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "009\r0: 61 32 5B 0D 04 FF\r1: FF FF FF 00\r>";
        return;
      }
      await origWrite(line);
    };
    const elm = new Elm327Client(link);
    const p620 = ETACS_PROFILES.find((p) => p.id === "620-504")!;
    const dump = await readEtacsCoding(elm, p620);
    expect(dump.variantUsedId).toBe("21 52");
    expect(Array.from(dump.variant)).toEqual([0x11, 0x22, 0x33, 0x44, 0x55, 0x66]);
    expect(dump.customUsedId).toBe("21 32");
    expect(Array.from(dump.custom)).toEqual([0x5b, 0x0d, 0x04, 0xff, 0xff, 0xff, 0xff]);
  });

  it("never sends 1085 (ECUProgrammingSession) to Engine ECU 1860D362 and succeeds via passport registers when coding LIDs return 7F 21 12", async () => {
    const link = new FakeLink();
    const origWrite = link.writeLine.bind(link);
    link.writeLine = async (line: string) => {
      if (line === "1089") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "50 89\r>";
        return;
      }
      if (line === "2180") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "61 80 31 38 36 30 44 33 36 32\r>";
        return;
      }
      if (line === "2199") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "61 99 4A 4D 31 38 36 30 44 33 36 32\r>";
        return;
      }
      if (/^21[0-9A-F]{2}$/.test(line)) {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "7F 21 12\r>";
        return;
      }
      await origWrite(line);
    };
    const elm = new Elm327Client(link);
    const engineProfile = ETACS_PROFILES.find((p) => p.id === "engine-auto")!;
    const dump = await readEtacsCoding(elm, engineProfile);
    expect(link.written).not.toContain("1085");
    expect(link.written).toContain("1089");
    expect(dump.partNumber).toBe("1860D362");
    expect(dump.variantUsedId).toBe("21 99");
    expect(dump.extraLids?.some((e) => e.lidHex === "21 80")).toBe(true);
  });

  it("generates byte-for-byte identical 1233-byte MMCodingWriter .kon and .cuf containers with CRC-16/X25 and parses them back", () => {
    const etacsKonHex =
      "28820042F008205500A40A041004831A58228C50CA431500481601104023094780242617C48A009220020A06140CC3881851E2D9C311A50545A0570B2A538A0000008C030100001E1202B0050000200152370000002900010000";
    // Include trailing KWP A0 05 A0 01 footer to verify it is stripped automatically
    const rawWithFooterHex = `${etacsKonHex}A005A001`;
    const rawBytes = new Uint8Array(
      rawWithFooterHex.match(/.{1,2}/g)!.map((b) => Number.parseInt(b, 16)),
    );

    const container = formatMutCodingContainer({
      payload: rawBytes,
      partNumber: "8637C671",
      vin: "MMEMCY1XXNH003447",
      timestamp: "202504061736",
    });

    expect(container.length).toBe(1233);
    // Check UTF-8 BOM
    expect(Array.from(container.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const ascii = new TextDecoder().decode(container.slice(3));
    expect(ascii.slice(2, 19)).toBe("MMEMCY1XXNH003447");
    expect(ascii.slice(80, 92)).toBe("202504061736");
    expect(ascii.slice(162, 170)).toBe("8637C671");
    expect(ascii.slice(200, 380)).toBe(etacsKonHex);
    expect(ascii.slice(712, 892)).toBe(etacsKonHex);
    expect(ascii.slice(1224, 1228)).toBe("CB1C");

    // Verify Engine 1860D362 CRC-16/X25 matches reference 3FD2
    const engineHex = "81070500400403000947C98105000201";
    const engineContainer = formatMutCodingContainer({
      payload: new Uint8Array(engineHex.match(/.{1,2}/g)!.map((b) => Number.parseInt(b, 16))),
      partNumber: "1860D362",
      vin: "MMEMCY1XXNH003447",
      timestamp: "202504061738",
    });
    const engineAscii = new TextDecoder().decode(engineContainer.slice(3));
    expect(engineAscii.slice(1224, 1228)).toBe("3FD2");

    // Verify ETACS .cuf CRC-16/X25 matches reference 94D1
    const cufHex =
      "4040408080204020804080804080402080402040808080801020404080404040408040408040802040000000000000000000000000000000000000000000000000";
    expect(crc16X25Ascii(cufHex.padEnd(512, " "))).toBe("94D1");

    // Verify round-trip parsing back into raw 90-byte coding payload
    const parsedBack = parseMitsubishiCodingFileBytes(container, "kon", "8637C671_MMEMCY1XXNH003447_20250406_1.kon");
    expect(parsedBack.payload.length).toBe(90);
    expect(parsedBack.detectedPartNumber).toBe("8637C671");
  });

  it("reads VIN (1A 90), Part Number (1A 87), and SW Version (1A 9C) via KWP Service 1A and skips .cuf on Engine ECU", async () => {
    const link = new FakeLink();
    const origWrite = link.writeLine.bind(link);
    link.writeLine = async (line: string) => {
      if (line === "1092" || line === "1089") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "50 89\r>";
        return;
      }
      if (line === "1A87") {
        link.written.push(line);
        // 5A 87 + binary header + "1860D362  "
        (link as unknown as { pending: string }).pending +=
          "5A 87 04 82 00 17 FF 20 00 3D 00 00 31 38 36 30 44 33 36 32 20 20\r>";
        return;
      }
      if (line === "1A9C") {
        link.written.push(line);
        // 5A 9C + binary header + "1860D362-A"
        (link as unknown as { pending: string }).pending +=
          "5A 9C 01 04 82 00 17 FF 3D 00 00 31 38 36 30 44 33 36 32 2D 41\r>";
        return;
      }
      if (line === "1A90") {
        link.written.push(line);
        // 5A 90 + ASCII "MMEMCY1XXNH003447"
        (link as unknown as { pending: string }).pending +=
          "5A 90 4D 4D 45 4D 43 59 31 58 58 4E 48 30 30 33 34 34 37\r>";
        return;
      }
      if (line === "21C0") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending +=
          "61 C0 81 07 05 00 40 04 03 00 09 47 C9 81 05 00 02 01 A0 05 A0 01\r>";
        return;
      }
      if (line === "21C1") {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "61 C1 05 A0 05 A0 01\r>";
        return;
      }
      if (/^(1A|21)[0-9A-F]{2}$/.test(line)) {
        link.written.push(line);
        (link as unknown as { pending: string }).pending += "7F 21 12\r>";
        return;
      }
      await origWrite(line);
    };
    const elm = new Elm327Client(link);
    const engineProfile = ETACS_PROFILES.find((p) => p.id === "engine-7e0-kwp")!;
    const dump = await readEtacsCoding(elm, engineProfile);
    expect(dump.partNumber).toBe("1860D362");
    expect(dump.swVersion).toBe("1860D362-A");
    expect(dump.vin).toBe("MMEMCY1XXNH003447");
    expect(dump.variantUsedId).toBe("21 C0");
    expect(dump.variant.length).toBe(16);
    // Engine ECU must NOT populate a .cuf custom coding block
    expect(dump.custom.length).toBe(0);
    expect(dump.customUsedId).toBeUndefined();
    // And 21 C1 (with A0 05 A0 01 stripped -> 1 byte "05") is preserved in extraLids
    const extraC1 = dump.extraLids?.find((e) => e.lidHex === "21 C1");
    expect(extraC1).toBeTruthy();
    expect(Array.from(extraC1!.payload)).toEqual([0x05]);
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

    // Safety modules (SRS 780, ABS/VDC 7B0, EPS 746, EyeSight 787, Mitsubishi SAS 622, ABS 784) must refuse DTC clearing
    const session = new ObdBleSession();
    for (const blockedTx of ["780", "7B0", "746", "787", "622", "784"]) {
      await expect(session.clearModuleDtcsSafe("6", blockedTx, "788")).rejects.toThrow(/заблокирован/i);
    }
  });

  it("decodes Mitsubishi 8AT/5AT (7E1 -> 7E9) ATF temp, engaged gear 1..8, and disengaged gear P/N state", () => {
    // 21 02 data bytes [A..K]:
    // B=10, C=0 -> inputRPM=1280; D=8, E=0 -> outputRPM=1024; F=122 -> ATF=82°C; G=108 -> ~14.0V; H=25 -> ~70km/h; I=51 -> slip=0; J=0x20 (bit 5 -> 4th gear), K=0x00
    const d02Engaged = [0x00, 10, 0, 8, 0, 122, 108, 25, 51, 0x20, 0x00];
    const d04Drive = [0x00, 0x00, 0x08]; // C = 0x08 (D)
    const tcmEngaged = decodeMitsubishiAt2102And2104(d02Engaged, d04Drive);
    expect(tcmEngaged.atfTempC).toBe(82);
    expect(tcmEngaged.gearNumber).toBe(4);
    expect(tcmEngaged.currentGearText).toContain("4-я передача");
    expect(tcmEngaged.isGearDisengaged).toBe(false);
    expect(tcmEngaged.torqueConverterSlipRpm).toBe(0);

    // 8th gear on Pajero Sport III 8AT (K bit 1 = 0x02)
    const d02Gear8 = [0x00, 12, 0, 15, 0, 125, 108, 35, 52, 0x00, 0x02];
    const tcmGear8 = decodeMitsubishiAt2102And2104(d02Gear8, d04Drive);
    expect(tcmGear8.gearNumber).toBe(8);
    expect(tcmGear8.isGearDisengaged).toBe(false);

    // Disengaged gear in Park / Neutral (J bit 0 = 0x01, C = 0x04 N)
    const d02Neutral = [0x00, 6, 0, 0, 0, 110, 108, 0, 51, 0x01, 0x00];
    const d04Neutral = [0x00, 0x00, 0x04];
    const tcmNeutral = decodeMitsubishiAt2102And2104(d02Neutral, d04Neutral);
    expect(tcmNeutral.atfTempC).toBe(70);
    expect(tcmNeutral.gearNumber).toBe(0);
    expect(tcmNeutral.isGearDisengaged).toBe(true);
    expect(tcmNeutral.disengagedStateText).toContain("ПЕРЕДАЧА ВЫКЛЮЧЕНА");

    // CVT decode (21 03, 21 06, 21 07, 21 10)
    const cvt = decodeMitsubishiCvt({
      data2103: [0x04, 0x00, 0x05, 0x00, 0x00, 0x02, 0, 0, 0, 0, 0, 0, 0, 80],
      data2106: [0x00, 0x00, 0x02], // C=2 -> 3rd virtual gear
      data2107: [0x80], // bit 7 -> D
      data2110: [0x00, 0x00, 0x01, 0x20], // degradation = 288
    });
    expect(cvt.atfTempC).not.toBeNull();
    expect(cvt.gearNumber).toBe(3);
    expect(cvt.cvtDegradationCount).toBe(288);
    expect(cvt.isGearDisengaged).toBe(false);
  });

  it("decodes TPMS 4+1 wheels, KWP18 DTCs, CAN broadcast frames, and CAN Diff-Sniffer", () => {
    // 21 28 IDs (5 wheels * 4 bytes) + 21 01 pressures & temperatures
    const d28 = [
      0x11, 0x22, 0x33, 0x01,
      0x11, 0x22, 0x33, 0x02,
      0x11, 0x22, 0x33, 0x03,
      0x11, 0x22, 0x33, 0x04,
      0x11, 0x22, 0x33, 0x05,
    ];
    // 160 * 1.373 = 220 kPa = 2.20 bar; 75 - 50 = 25°C
    const d01 = [160, 75, 160, 76, 162, 74, 162, 75, 158, 72];
    const tpmsWheels = decodeMitsubishiTpmsPayload({ lid2101: d01, lid2128: d28 });
    expect(tpmsWheels).toHaveLength(5);
    expect(tpmsWheels[0]?.sensorIdHex).toBe("11223301");
    expect(tpmsWheels[0]?.pressureBar).toBeCloseTo(2.2, 1);
    expect(tpmsWheels[0]?.temperatureC).toBe(25);
    expect(tpmsWheels[4]?.wheelIndex).toBe(5);
    expect(tpmsWheels[4]?.sensorIdHex).toBe("11223305");

    // KWP2000 Service 18 (18 00 FF 00) DTC parser: [count=1, 0xC1, 0x21, 0x20] -> U0121
    const kwpDtcs = parseKwpDtcs18([0x01, 0xc1, 0x21, 0x20]);
    expect(kwpDtcs).toHaveLength(1);
    expect(kwpDtcs[0]?.code).toBe("U0121");
    expect(kwpDtcs[0]?.active).toBe(true);

    // Passive CAN broadcast decoder (0x236 steering, 0x318 AT gear, 0x154 fuel, 0x608 coolant)
    const sig236 = decodeCanBroadcastFrame("236", [0x10, 0x00, 0x05]); // 4096 = 0.0°
    expect(sig236?.summary).toContain("0°");
    const sig318Disengaged = decodeCanBroadcastFrame("318", [0x4e, 0x00]); // N -> передача выключена
    expect(sig318Disengaged?.summary).toContain("передача выключена");
    const sig608 = decodeCanBroadcastFrame("608", [128, 62]); // 88°C, 22°C
    expect(sig608?.summary).toContain("88 °C");

    // CAN Diff-Sniffer
    const base = [
      { id: "236", dlc: 3, data: [0x10, 0x00, 0x00] },
      { id: "318", dlc: 2, data: [0x50, 0x00] },
    ];
    const act = [
      { id: "236", dlc: 3, data: [0x10, 0x00, 0x00] },
      { id: "318", dlc: 2, data: [0x44, 0x03] },
    ];
    const canDiffs = diffCanBusSnapshots(base, act);
    expect(canDiffs).toHaveLength(1);
    expect(canDiffs[0]?.idHex).toBe("318");
    expect(canDiffs[0]?.changedByteIndices).toEqual([0, 1]);
  });

  it("executes transport-level Mitsubishi TCM, TPMS, SAS calibration, and Meter sequences over Elm327Client", async () => {
    const link = new FakeLink();
    const origWrite = link.writeLine.bind(link);
    let currentHeader = "";
    link.writeLine = async (line: string) => {
      if (line.startsWith("ATSH")) {
        currentHeader = line.slice(4).trim().toUpperCase();
      }
      link.written.push(line);
      if (line === "2102") {
        (link as unknown as { pending: string }).pending +=
          "61 02 00 0A 00 08 00 7A 6C 19 33 20 00\r>";
        return;
      }
      if (line === "2104") {
        (link as unknown as { pending: string }).pending += "61 04 00 00 08\r>";
        return;
      }
      if (line === "2128") {
        (link as unknown as { pending: string }).pending +=
          "016\r0: 61 28 11 22 33 01\r1: 11 22 33 02 11 22 33\r2: 03 11 22 33 04 11 22\r3: 33 05 00 00\r>";
        return;
      }
      if (line === "2101") {
        if (currentHeader === "622") {
          (link as unknown as { pending: string }).pending += "61 01 10 00 00\r>";
          return;
        }
        (link as unknown as { pending: string }).pending +=
          "00C\r0: 61 01 A0 4B A0 4C\r1: A2 4A A2 4B 9E 48 00\r>";
        return;
      }
      if (line === "1092") {
        (link as unknown as { pending: string }).pending += "50 92\r>";
        return;
      }
      if (line === "3102") {
        (link as unknown as { pending: string }).pending += "71 02 00\r>";
        return;
      }
      if (line === "3101") {
        (link as unknown as { pending: string }).pending += "71 01 00\r>";
        return;
      }
      if (line === "1101") {
        (link as unknown as { pending: string }).pending += "51 01\r>";
        return;
      }
      if (line === "21A3") {
        // C byte = 80 -> (80 - 16) * 0.7 = 44.8 L
        (link as unknown as { pending: string }).pending += "61 A3 00 00 50\r>";
        return;
      }
      if (line === "21AD") {
        (link as unknown as { pending: string }).pending += "61 AD 01 E2 40\r>";
        return;
      }
      link.written.pop();
      await origWrite(line);
    };

    const elm = new Elm327Client(link);

    const tcm = await readMitsubishiTransmission(elm);
    expect(tcm.atfTempC).toBe(82);
    expect(tcm.gearNumber).toBe(4);
    expect(tcm.isGearDisengaged).toBe(false);

    const tpms = await readTpmsSensors(elm, "mitsubishi-773");
    expect(tpms.wheels).toHaveLength(5);
    expect(tpms.wheels[0]?.sensorIdHex).toBe("11223301");

    const sas = await readMitsubishiSteeringAngle(elm, "sas-622");
    expect(sas.angleDeg).toBe(0);

    const cal = await calibrateMitsubishiSasZero(elm);
    expect(cal.success).toBe(true);
    expect(cal.finalAngleDeg).toBe(0);

    const meter = await readMitsubishiMeter(elm);
    expect(meter.fuelLiters).toBeCloseTo(44.8, 1);
    expect(meter.odometerKm).toBe(123456);
  });
});

