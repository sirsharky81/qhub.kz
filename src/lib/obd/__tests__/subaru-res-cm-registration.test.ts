import { describe, expect, it } from "vitest";
import {
  SUBARU_RES_BLOCKED_PAYLOADS,
  SUBARU_RES_CM_SAFE_PATH,
  SUBARU_RES_REGISTRATION_CANDIDATES,
  probeSubaruResCm,
  registerSubaruResCm,
  type SubaruResLink,
} from "../subaru-res-cm-registration";

function scriptedElm(replies: Record<string, string | string[]>): SubaruResLink & { sent: string[] } {
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
      if (key === "1003") return "50 03";
      if (key === "1001") return "50 01";
      if (key === "3E00") return "7E 00";
      return "NO DATA";
    },
  };
}

describe("subaru-res-cm-registration", () => {
  it("keeps F2 RES registration on Keyless/BIU and never includes key-delete payloads", () => {
    expect(SUBARU_RES_CM_SAFE_PATH.ssm4MenuEn).toBe("Remote Engine Start CM Registration");
    expect(SUBARU_RES_CM_SAFE_PATH.talkTx).toEqual(["750", "752"]);
    expect(SUBARU_RES_REGISTRATION_CANDIDATES.every((c) => c.txHex === "750" || c.txHex === "752")).toBe(true);
    expect(SUBARU_RES_REGISTRATION_CANDIDATES.every((c) => c.payloadHex.startsWith("3101"))).toBe(true);
    for (const blocked of SUBARU_RES_BLOCKED_PAYLOADS) {
      expect(SUBARU_RES_REGISTRATION_CANDIDATES.some((c) => c.payloadHex === blocked)).toBe(false);
    }
  });

  it("probes 750 F18E without sending 2E or 27", async () => {
    const elm = scriptedElm({
      "22F18E": "62 F1 8E 48 30 30 31 53 41 4E 30 30 30",
    });
    const probe = await probeSubaruResCm(elm);
    expect(probe.keylessOk).toBe(true);
    expect(elm.sent.some((s) => s.startsWith("2E") || s.startsWith("27"))).toBe(false);
    expect(elm.sent.some((s) => (SUBARU_RES_BLOCKED_PAYLOADS as readonly string[]).includes(s))).toBe(false);
  });

  it("registers on 31 01 06 01 71 and polls 31 03 without SecurityAccess", async () => {
    const elm = scriptedElm({
      "31010601": "71 01 06 01",
      "31030601": "71 03 06 01",
    });
    const result = await registerSubaruResCm(elm);
    expect(result.success).toBe(true);
    expect(result.acceptedPayload).toBe("31010601");
    expect(result.acceptedTx).toBe("750");
    expect(result.securityAccessRequired).toBe(false);
    expect(elm.sent.filter((s) => s.startsWith("31"))).toEqual(["31010601", "31030601"]);
    expect(elm.sent.some((s) => s.startsWith("27") || s.startsWith("2E"))).toBe(false);
  });

  it("stops on NRC 33 without inventing a seed-key", async () => {
    const elm = scriptedElm({
      "31010601": "7F 31 33",
    });
    const result = await registerSubaruResCm(elm);
    expect(result.success).toBe(false);
    expect(result.securityAccessRequired).toBe(true);
    expect(elm.sent.some((s) => s.startsWith("27"))).toBe(false);
    expect(elm.sent.some((s) => (SUBARU_RES_BLOCKED_PAYLOADS as readonly string[]).includes(s))).toBe(false);
  });
});
