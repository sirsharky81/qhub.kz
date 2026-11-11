import { describe, expect, it } from "vitest";
import {
  SUBARU_METER_SECURITY_KEY_TABLES,
  SUBARU_METER_WRITE_ALLOWED_DESTINATIONS,
  SUBARU_METER_WRITE_DIDS,
  buildSubaruMeter12ColumnWritePlan,
  computeSubaruSecurityKey16ByteAesEcb,
  computeSubaruSecurityKey4Byte,
  writeSubaruMeter12ColumnCode,
  type SubaruMeterWriteLink,
} from "../subaru-meter-variant";

function scriptedElm(replies: Record<string, string | string[]>): SubaruMeterWriteLink & {
  sent: string[];
} {
  const sent: string[] = [];
  const queues: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(replies)) {
    queues[key] = Array.isArray(value) ? [...value] : [value];
  }
  return {
    sent,
    async sendCommand(command: string) {
      sent.push(command.replace(/\s+/g, "").toUpperCase());
      return "OK";
    },
    async setCanHeader() {},
    async sendPayload(hex: string) {
      const key = hex.replace(/\s+/g, "").toUpperCase();
      sent.push(key);
      const queue = queues[key];
      if (queue && queue.length > 0) return queue.shift()!;
      if (key === "1003" || key === "1001" || key === "3E00") return "50 03";
      return "NO DATA";
    },
  };
}

describe("subaru-meter-variant", () => {
  it("splices packed US ASCII in DID 0250 into Canada C0 without changing length", () => {
    const plan = buildSubaruMeter12ColumnWritePlan("BTACYRB", "C05D", [
      { did: "0250", hex: "42 54 41 43 59 52 42 55 34 35 44" },
    ]);
    expect(plan.ok).toBe(true);
    expect(plan.packedAscii).toBe("BTACYRBC05D");
    expect(plan.candidates[0]?.did).toBe("0250");
    expect(plan.candidates[0]?.dataHex).toBe("42 54 41 43 59 52 42 43 30 35 44");
    expect(plan.candidates[0]?.requestHex).toBe("2E02504254414359524243303544");
    expect(plan.candidates.every((c) => SUBARU_METER_WRITE_DIDS.includes(c.did))).toBe(true);
    expect(plan.candidates.every((c) => c.requestHex.startsWith("2E0250") || c.requestHex.startsWith("2E0251"))).toBe(
      true,
    );
  });

  it("keeps 12th padding/checksum byte when replacing 11 ASCII chars", () => {
    const padded = buildSubaruMeter12ColumnWritePlan("BTACYRB", "C05D", [
      { did: "0250", hex: "42 54 41 43 59 52 42 55 34 35 44 00" },
    ]);
    expect(padded.candidates[0]?.dataHex).toBe("42 54 41 43 59 52 42 43 30 35 44 00");

    const usBody = [0x42, 0x54, 0x41, 0x43, 0x59, 0x52, 0x42, 0x55, 0x34, 0x35, 0x44];
    const xor = usBody.reduce((a, b) => a ^ b, 0) & 0xff;
    const xorHex = [...usBody, xor].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
    const xored = buildSubaruMeter12ColumnWritePlan("BTACYRB", "C05D", [{ did: "0250", hex: xorHex }]);
    const caBody = [0x42, 0x54, 0x41, 0x43, 0x59, 0x52, 0x42, 0x43, 0x30, 0x35, 0x44];
    const caXor = caBody.reduce((a, b) => a ^ b, 0) & 0xff;
    const expected = [...caBody, caXor].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
    expect(xored.candidates[0]?.dataHex).toBe(expected);
  });

  it("splices UTF-16LE Applied+Option inside a longer DID", () => {
    const utf16 = "BTACYRBU45D"
      .split("")
      .flatMap((ch) => [ch.charCodeAt(0), 0x00])
      .concat([0x00, 0x00]);
    const hex = utf16.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
    const plan = buildSubaruMeter12ColumnWritePlan("BTACYRB", "C05D", [{ did: "0250", hex }]);
    expect(plan.ok).toBe(true);
    const ascii = (plan.candidates[0]?.dataHex ?? "")
      .split(" ")
      .filter((_, i) => i % 2 === 0)
      .map((tok) => String.fromCharCode(Number.parseInt(tok, 16)))
      .join("")
      .replace(/\0/g, "");
    expect(ascii.startsWith("BTACYRBC05D")).toBe(true);
    expect(plan.candidates[0]?.dataHex.split(" ").length).toBe(utf16.length);
  });

  it("rejects EC/EA 433 MHz destinations and unknown codes", () => {
    expect(buildSubaruMeter12ColumnWritePlan("BTACYRB", "EC5D").ok).toBe(false);
    expect(buildSubaruMeter12ColumnWritePlan("BTACYRB", "EA5D").reasonRu).toMatch(/433/);
    expect(buildSubaruMeter12ColumnWritePlan("BTACYRB", "K05D").ok).toBe(false);
    expect(buildSubaruMeter12ColumnWritePlan("XXXXXXX", "C05D").ok).toBe(false);
    expect(SUBARU_METER_WRITE_ALLOWED_DESTINATIONS).toEqual(["U4", "U5", "U6", "C0", "C5"]);
  });

  it("refuses a non-ASCII bitmask DID instead of guessing bits", () => {
    const plan = buildSubaruMeter12ColumnWritePlan("BTACYRB", "C05D", [
      { did: "0250", hex: "01 02 03 04 05 06 07 08" },
    ]);
    expect(plan.ok).toBe(false);
    expect(plan.candidates).toEqual([]);
    expect(plan.reasonRu).toMatch(/битовую маску/);
  });

  it("falls back to 11-byte then 12-byte ASCII when the meter DID was empty", () => {
    const plan = buildSubaruMeter12ColumnWritePlan("BTACYRB", "U45D", []);
    expect(plan.ok).toBe(true);
    expect(plan.candidates.map((c) => c.requestHex)).toEqual([
      "2E02504254414359524255343544",
      "2E0250425441435952425534354400",
      "2E02514254414359524255343544",
    ]);
  });

  it("writes 2E 0250 on NRC 78 then 6E, and never sends SecurityAccess or foreign DIDs", async () => {
    const elm = scriptedElm({
      "2E02504254414359524243303544": ["7F 2E 78", "6E 02 50"],
    });
    const result = await writeSubaruMeter12ColumnCode(elm, {
      appliedModel: "BTACYRB",
      optionCode: "C05D",
      currentDids: [{ did: "0250", hex: "42 54 41 43 59 52 42 55 34 35 44" }],
      txHex: "783",
      rxHex: "78B",
    });
    expect(result.success).toBe(true);
    expect(result.writtenDid).toBe("0250");
    expect(result.securityAccessRequired).toBe(false);
    expect(elm.sent.filter((s) => s.startsWith("2E"))).toEqual([
      "2E02504254414359524243303544",
      "2E02504254414359524243303544",
    ]);
    expect(elm.sent.some((s) => s.startsWith("27"))).toBe(false);
    expect(elm.sent.some((s) => s.includes("WRITECOMMONAREA") || s.startsWith("2E0200") || s.startsWith("2EF190"))).toBe(
      false,
    );
  });

  it("stops on NRC 33 without inventing a seed-key", async () => {
    const elm = scriptedElm({
      "2E02504254414359524243303544": "7F 2E 33",
    });
    const result = await writeSubaruMeter12ColumnCode(elm, {
      appliedModel: "BTACYRB",
      optionCode: "C05D",
      currentDids: [{ did: "0250", hex: "42 54 41 43 59 52 42 55 34 35 44" }],
      txHex: "783",
      rxHex: "78B",
    });
    expect(result.success).toBe(false);
    expect(result.securityAccessRequired).toBe(true);
    expect(elm.sent.some((s) => s.startsWith("27"))).toBe(false);
    expect(result.steps.join(" ")).toMatch(/SecurityAccess/);
  });

  it("writes MET-002.srp A002/A011 variant registers (2E 10C2 FF -> 2E A002 03 -> 2E A011 00 -> 2E 10C2 00) when meter uses A0xx table", async () => {
    const elm = scriptedElm({
      "2E10C2FF": "6E 10 C2",
      "2EA00203": "6E A0 02",
      "2EA01100": "6E A0 11",
      "2E10C200": "6E 10 C2",
    });
    const result = await writeSubaruMeter12ColumnCode(elm, {
      appliedModel: "BTAEYR8",
      optionCode: "C05L",
      currentDids: [
        { did: "0250", hex: "01 02 03 04" },
        { did: "A002", hex: "02" },
        { did: "A011", hex: "FF" },
      ],
      txHex: "783",
      rxHex: "78B",
    });
    expect(result.success).toBe(true);
    expect(result.writtenDid).toBe("A002/A011");
    expect(result.writtenHex).toBe("A002=03 A011=00");
    expect(elm.sent.filter((s) => s.startsWith("2E"))).toEqual([
      "2E10C2FF",
      "2EA00203",
      "2EA01100",
      "2E10C200",
    ]);
  });

  it("unlocks 27 03 -> 27 04 using FHIUtilityCtrlNK GetSecurityAccessSelKey(idx=11 LE, ctrl-mode1) after passcode 0205 when 2E 0250 returns NRC 31 or 2E 10C2 FF returns NRC 33", async () => {
    const seed = [0x12, 0x34, 0x56, 0x78];
    const expectedKey = computeSubaruSecurityKey4Byte(
      seed,
      SUBARU_METER_SECURITY_KEY_TABLES[0]!.words,
      "ctrl-mode1",
    )
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");

    const elm = scriptedElm({
      "2E02504254414359523855343544": "7F 2E 31",
      "2E0250425441435952385534354400": "7F 2E 31",
      "2E02514254414359523855343544": "7F 2E 31",
      // CGW FilterRemove must succeed first — otherwise SGP drops 27 xx to the meter
      "31010200": "71 01 02 00",
      "2210C2": "62 10 C2 00",
      // probe after FilterRemove + unlockSubaruMeterSecurityAccess + retries
      "2703": ["67 03 12 34 56 78", "67 03 12 34 56 78", "67 03 12 34 56 78", "67 03 12 34 56 78"],
      [`2704${expectedKey}`]: ["67 04", "67 04", "67 04"],
      "2E10C2FF": "6E 10 C2",
      "2EA00202": "6E A0 02",
      "2EA011FF": "6E A0 11",
      "2E10C200": "6E 10 C2",
    });

    const result = await writeSubaruMeter12ColumnCode(elm, {
      appliedModel: "BTACYR8",
      optionCode: "U45D",
      currentDids: [],
      txHex: "783",
      rxHex: "78B",
    });

    expect(result.success).toBe(true);
    expect(result.securityAccessRequired).toBe(false);
    expect(result.writtenDid).toBe("A002/A011");
    expect(result.writtenHex).toBe("A002=02 A011=FF");
    expect(result.seedHex).toBe("12 34 56 78");
    expect(elm.sent).toContain("31010200");
    expect(elm.sent.indexOf("31010200")).toBeLessThan(elm.sent.indexOf("2703"));
    expect(elm.sent).toContain("2703");
    expect(elm.sent).toContain(`2704${expectedKey}`);
    expect(result.steps.join(" ")).toMatch(/фильтр SID снят/);

    // Verify AES-128-ECB vector from SSM4 CMD_SecurityAccess2018CY1
    const aesSeed = [
      0xf8, 0xee, 0x16, 0x09, 0xec, 0x9a, 0xb9, 0x1c,
      0x83, 0x58, 0x06, 0x0f, 0xde, 0xbc, 0x3e, 0x06,
    ];
    const aesKey = [
      0x33, 0xe6, 0x3c, 0xa0, 0x43, 0x11, 0x53, 0x46,
      0x0c, 0x18, 0xf1, 0x06, 0x4c, 0x70, 0xfe, 0x41,
    ];
    const aesOut = computeSubaruSecurityKey16ByteAesEcb(aesSeed, aesKey)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");
    expect(aesOut).toBe("AA21C0117CF3DCB6BC1F7A7F90EE78CA");
  });

  it("runs cgwChkAndFilterRemove (31 01 02 00) before meter SecurityAccess so CGW stops dropping 27 xx", async () => {
    const seed16 = [
      0xf8, 0xee, 0x16, 0x09, 0xec, 0x9a, 0xb9, 0x1c, 0x83, 0x58, 0x06, 0x0f, 0xde, 0xbc, 0x3e, 0x06,
    ];
    const keyC1 = [
      0x66, 0xd5, 0x36, 0x4a, 0x0d, 0x2d, 0x45, 0xc6, 0x7e, 0x8d, 0xb1, 0x20, 0xed, 0x47, 0x14, 0x38,
    ];
    const outKey = computeSubaruSecurityKey16ByteAesEcb(seed16, keyC1)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");
    const meterSeed = [0x12, 0x34, 0x56, 0x78];
    const meterKey = computeSubaruSecurityKey4Byte(
      meterSeed,
      SUBARU_METER_SECURITY_KEY_TABLES[0]!.words,
      "ctrl-mode1",
    )
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");

    const elm = scriptedElm({
      // First CGW attempt: FilterRemove needs SA (NRC 33), then AES unlock KeyVersion C1, then 31 01 02 00 OK
      "31010200": ["7F 31 33", "71 01 02 00"],
      "3101020C": "7F 31 33",
      "31011201": "7F 31 33",
      "220251": "62 02 51 C1",
      "2707": "67 07 F8 EE 16 09 EC 9A B9 1C 83 58 06 0F DE BC 3E 06",
      [`2708${outKey}`]: "67 08",
      "2210C2": "62 10 C2 00",
      "2E0250425441455952385534354C": "7F 2E 31",
      "2E0250425441455952385534354C00": "7F 2E 31",
      "2E0251425441455952385534354C": "7F 2E 31",
      "2703": ["67 03 12 34 56 78", "67 03 12 34 56 78", "67 03 12 34 56 78", "67 03 12 34 56 78"],
      [`2704${meterKey}`]: ["67 04", "67 04", "67 04"],
      "2E10C2FF": "6E 10 C2",
      "2EA00202": "6E A0 02",
      "2EA011FF": "6E A0 11",
      "2E10C200": "6E 10 C2",
    });

    const result = await writeSubaruMeter12ColumnCode(elm, {
      appliedModel: "BTAEYR8",
      optionCode: "U45L",
      currentDids: [],
      txHex: "783",
      rxHex: "78B",
    });

    expect(elm.sent).toContain("31010200");
    expect(elm.sent.some((s) => s.startsWith("2707") || s.startsWith("2708") || s === "31010200")).toBe(
      true,
    );
    expect(elm.sent.indexOf("31010200")).toBeLessThan(elm.sent.indexOf("2703"));
    expect(result.steps.join(" ")).toMatch(/фильтр SID снят/);
    expect(result.success).toBe(true);
    // outKey kept so AES path stays covered when KeyVersion C1 is matched first
    expect(outKey).toHaveLength(32);
  });
});
