import { describe, expect, it } from "vitest";
import {
  SUBARU_METER_WRITE_ALLOWED_DESTINATIONS,
  SUBARU_METER_WRITE_DIDS,
  buildSubaruMeter12ColumnWritePlan,
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
});
