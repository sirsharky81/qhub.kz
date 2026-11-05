import { describe, expect, it } from "vitest";
import {
  SUBARU_RES_BLOCKED_PAYLOADS,
  SUBARU_RES_CM_SAFE_PATH,
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
  it("documents exact SSM4 IMM-071/017 (2E 11 B0 01) and IMM-005/064 (31 01 40 05) frames and blocks key-delete & telematics", () => {
    expect(SUBARU_RES_CM_SAFE_PATH.ssm4MenuEn).toBe("Remote Engine Start CM Registration");
    expect(SUBARU_RES_CM_SAFE_PATH.pushStartWriteFrame).toBe("2E11B001");
    expect(SUBARU_RES_CM_SAFE_PATH.keyStartRoutineStart).toBe("31014005");
    expect(SUBARU_RES_BLOCKED_PAYLOADS).toContain("2E11B201");
    expect(SUBARU_RES_BLOCKED_PAYLOADS).toContain("31014004");
    expect(SUBARU_RES_BLOCKED_PAYLOADS).toContain("31010601");
  });

  it("probes 7B4, 751, 752, and 750 without sending 2E, 27, or 31", async () => {
    const elm = scriptedElm({
      "22F18E": "62 F1 8E 48 30 30 31 53 41 4E 30 30 30",
    });
    const probe = await probeSubaruResCm(elm);
    expect(probe.keylessOk).toBe(true);
    expect(probe.biuOk).toBe(true);
    expect(probe.modules.map((m) => m.txHex)).toEqual(["7B4", "751", "752", "750"]);
    expect(elm.sent.some((s) => s.startsWith("2E") || s.startsWith("27") || s.startsWith("31"))).toBe(false);
  });

  it("registers Push-Start RES via 2E 11 B0 01 on 7B4 (IMM-071)", async () => {
    const elm = scriptedElm({
      "2707": `67 07 ${Array(16).fill("00").join(" ")}`,
      "2E11B001": "6E 11 B0",
    });
    const result = await registerSubaruResCm(elm);
    expect(result.success).toBe(true);
    expect(result.acceptedPayload).toBe("2E11B001");
    expect(result.acceptedTx).toBe("7B4");
    expect(result.securityAccessRequired).toBe(false);
    expect(elm.sent).toContain("2E11B001");
    expect(elm.sent.some((s) => (SUBARU_RES_BLOCKED_PAYLOADS as readonly string[]).includes(s))).toBe(false);
  });

  it("falls back to BIU 752 31 01 40 05 -> 31 03 40 05 when Push-Start ECUs do not answer", async () => {
    const elm = scriptedElm({
      "1003": ["NO DATA", "NO DATA", "NO DATA", "50 03"],
      "31014005": "71 01 40 05",
      "31034005": "71 03 40 05 00 02",
    });
    const result = await registerSubaruResCm(elm);
    expect(result.success).toBe(true);
    expect(result.acceptedPayload).toBe("31014005");
    expect(result.acceptedTx).toBe("752");
  });

  it("respects explicit systemType (d-type-751 only talks to 751, key-biu-752 only talks to 752)", async () => {
    const elmD = scriptedElm({
      "2703": "67 03 00 00 00 00",
      "2E11B001": "6E 11 B0",
    });
    const resD = await registerSubaruResCm(elmD, { systemType: "d-type-751" });
    expect(resD.success).toBe(true);
    expect(resD.acceptedTx).toBe("751");
    expect(elmD.sent).toContain("ATFCSH751");
    expect(elmD.sent).not.toContain("ATFCSH7B4");

    const elmBiu = scriptedElm({
      "31014005": "71 01 40 05",
      "31034005": "71 03 40 05 00 02",
    });
    const resBiu = await registerSubaruResCm(elmBiu, { systemType: "key-biu-752" });
    expect(resBiu.success).toBe(true);
    expect(resBiu.acceptedTx).toBe("752");
    expect(elmBiu.sent).toContain("ATFCSH752");
    expect(elmBiu.sent).not.toContain("2E11B001");
  });
});
