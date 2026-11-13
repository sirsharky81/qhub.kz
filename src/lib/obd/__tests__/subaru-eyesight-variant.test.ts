import { describe, expect, it } from "vitest";
import {
  readSubaruEyesight35xxDids,
  writeSubaruEyesightVariantByApplied,
} from "../subaru-eyesight-variant";
import {
  buildSubaruEyesightBackup,
  diffBackupVsLiveEyesight,
  parseSubaruEyesightBackupJson,
  serializeSubaruEyesightBackup,
} from "../subaru-eyesight-backup";
import {
  SUBARU_SGP_AES128_KEYS,
  computeSubaruSecurityKey16ByteAesEcb,
  type SubaruMeterWriteLink,
} from "../subaru-meter-variant";
import { getSsm4YywWriteDids, SSM4_YYW_FP_DID_KEYS } from "../subaru-ssm4-catalog";

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
      if (queue && queue.length > 0) {
        return queue.length > 1 ? queue.shift()! : queue[0]!;
      }
      if (key === "1003") return "50 03";
      if (key === "1001") return "50 01";
      if (key === "3E00") return "7E 00";
      return "NO DATA";
    },
  };
}

describe("subaru-eyesight-variant (ADA-031 / ADA-032)", () => {
  it("reads all 16 DIDs (3501..3510) after CGW FilterRemove and unlocks SA on NRC 33 (ADA-032)", async () => {
    const seed = [
      0xf8, 0xee, 0x16, 0x09, 0xec, 0x9a, 0xb9, 0x1c,
      0x83, 0x58, 0x06, 0x0f, 0xde, 0xbc, 0x3e, 0x06,
    ];
    const keyDef = SUBARU_SGP_AES128_KEYS.find((k) => k.id === "12234_0251_1")!;
    const keyBytes = keyDef.keyHex.match(/../g)!.map((h) => Number.parseInt(h, 16));
    const expectedKey = computeSubaruSecurityKey16ByteAesEcb(seed, keyBytes)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");

    const usBytes = getSsm4YywWriteDids("BTAEYR8", "U45D")!;
    const replies: Record<string, string | string[]> = {
      "3101020C": "71 01 02 0C",
      "220251": "62 02 51 01",
      "2703": "67 03 " + seed.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" "),
      [`2704${expectedKey}`]: "67 04",
    };
    for (const item of usBytes) {
      if (item.did === "3501") {
        replies[`22${item.did}`] = ["7F 22 33", `62 35 01 ${item.byteHex}`];
      } else {
        replies[`22${item.did}`] = `62 ${item.did.slice(0, 2)} ${item.did.slice(2)} ${item.byteHex}`;
      }
    }

    const elm = scriptedElm(replies);
    const res = await readSubaruEyesight35xxDids(elm, {
      didHexList: SSM4_YYW_FP_DID_KEYS,
    });

    expect(res.cgwFilterRemoved).toBe(true);
    expect(Object.keys(res.didMap)).toHaveLength(16);
    expect(res.didMap["3502"]).toBe("20");
    expect(res.didMap["3510"]).toBe("00");
    expect(elm.sent).toContain(`2704${expectedKey}`);
  });

  it("writes all 16 DIDs (3501..3510) in full-yyw ADA-031 mode and verifies every byte (B08/B09)", async () => {
    const caBytes = getSsm4YywWriteDids("BTAEYR8", "C0QF")!;
    expect(caBytes).toHaveLength(16);

    const replies: Record<string, string | string[]> = {
      "3101020C": "71 01 02 0C",
      "2703": "67 03 " + "00 ".repeat(16).trim(),
    };
    for (const item of caBytes) {
      replies[`2E${item.did}${item.byteHex}`] = `6E ${item.did.slice(0, 2)} ${item.did.slice(2)}`;
      replies[`22${item.did}`] = `62 ${item.did.slice(0, 2)} ${item.did.slice(2)} ${item.byteHex}`;
    }

    const elm = scriptedElm(replies);
    const res = await writeSubaruEyesightVariantByApplied(elm, "BTAEYR8", "C0QF", undefined, {
      writeMode: "full-yyw",
    });

    expect(res.success).toBe(true);
    expect(res.writtenCount).toBe(16);
    expect(res.verifiedCount).toBe(16);
    expect(res.mismatchedDids).toEqual([]);
    expect(elm.sent.filter((s) => s.startsWith("2E35"))).toHaveLength(16);
    expect(elm.sent).toContain("2E350230");
    expect(elm.sent).toContain("2E351000");

    // Unknown U45L must be blocked in full-yyw before touching the bus
    const elmBlocked = scriptedElm({});
    const blocked = await writeSubaruEyesightVariantByApplied(
      elmBlocked,
      "BTAEYR8",
      "U45L",
      undefined,
      { writeMode: "full-yyw" },
    );
    expect(blocked.success).toBe(false);
    expect(elmBlocked.sent).toHaveLength(0);
  });

  it("writes only 3502 in region-only mode while preserving 3501 and 3503..3510", async () => {
    const replies: Record<string, string> = {
      "3101020C": "71 01 02 0C",
      "2703": "67 03 00 00 00 00",
      "2E350230": "6E 35 02",
      "223502": "62 35 02 30",
    };
    const elm = scriptedElm(replies);
    const res = await writeSubaruEyesightVariantByApplied(elm, "BTAEYR8", "C0QF", undefined, {
      writeMode: "region-only",
    });

    expect(res.success).toBe(true);
    expect(res.targetCount).toBe(1);
    expect(res.verifiedCount).toBe(1);
    expect(elm.sent.filter((s) => s.startsWith("2E"))).toEqual(["2E350230"]);
  });

  it("builds, serializes, diffs, and restores 1:1 original EyeSight backup (even for U45L)", async () => {
    const usBytes = getSsm4YywWriteDids("BTAEYR8", "U45D")!;
    const backup = buildSubaruEyesightBackup(
      {
        capturedAt: "2026-11-14T00:00:00.000Z",
        vin: "4S4BTGUD1R3270223",
        txHex: "787",
        rxHex: "78F",
        dids: usBytes.map((u) => ({
          did: u.did,
          label: `DID ${u.did}`,
          hex: u.byteHex,
          decoded: u.byteHex,
        })),
        match: {
          appliedModel: "BTAEYR8",
          optionCode: "U45D",
          unique: true,
          candidates: ["BTAEYR8+U45D"],
          fp: "A520ECC7129B4800C308000000000000",
          destinationHint: "USA",
          byte3502: "20",
          explanationRu: "",
        },
      },
      "BTAEYR8",
      "U45L",
    );

    expect(backup.restore35xxDids).toHaveLength(16);
    expect(backup.stickerOptionCode).toBe("U45L");

    const parsed = parseSubaruEyesightBackupJson(serializeSubaruEyesightBackup(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const liveDiff = diffBackupVsLiveEyesight(
      parsed.backup,
      usBytes.map((u) => ({ did: u.did, hex: u.did === "3502" ? "30" : u.byteHex })),
    );
    expect(liveDiff.changed).toEqual([{ did: "3502", backupHex: "20", liveHex: "30" }]);

    const replies: Record<string, string> = {
      "3101020C": "71 01 02 0C",
      "2703": "67 03 00 00 00 00",
    };
    for (const item of parsed.backup.restore35xxDids) {
      replies[`2E${item.did}${item.byteHex}`] = `6E ${item.did.slice(0, 2)} ${item.did.slice(2)}`;
      replies[`22${item.did}`] = `62 ${item.did.slice(0, 2)} ${item.did.slice(2)} ${item.byteHex}`;
    }

    const elm = scriptedElm(replies);
    const restoreRes = await writeSubaruEyesightVariantByApplied(
      elm,
      parsed.backup.appliedModel,
      "U45L",
      undefined,
      {
        writeMode: "custom-35xx",
        customWrites: parsed.backup.restore35xxDids,
      },
    );
    expect(restoreRes.success).toBe(true);
    expect(restoreRes.verifiedCount).toBe(16);

    const badJson = serializeSubaruEyesightBackup({
      ...backup,
      restore35xxDids: [{ did: "0200", byteHex: "00" }],
    });
    expect(parseSubaruEyesightBackupJson(badJson).ok).toBe(false);
  });

  it("prioritizes EyeSight ecuKind=0x0002 / 0x0003 AES keys from 0x10082228 during ADA-031", async () => {
    const seed = [
      0xf8, 0xee, 0x16, 0x09, 0xec, 0x9a, 0xb9, 0x1c,
      0x83, 0x58, 0x06, 0x0f, 0xde, 0xbc, 0x3e, 0x06,
    ];
    const keyDef = SUBARU_SGP_AES128_KEYS.find((k) => k.id === "CTRL_0002_0251_1")!;
    const keyBytes = keyDef.keyHex.match(/../g)!.map((h) => Number.parseInt(h, 16));
    const expectedKey = computeSubaruSecurityKey16ByteAesEcb(seed, keyBytes)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");

    const elm = scriptedElm({
      "3101020C": "71 01 02 0C",
      "220251": "62 02 51 01",
      "2703": "67 03 " + seed.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" "),
      [`2704${expectedKey}`]: "67 04",
      "2E350230": "6E 35 02",
      "223502": "62 35 02 30",
    });

    const res = await writeSubaruEyesightVariantByApplied(elm, "BTAEYR8", "C0QF", undefined, {
      writeMode: "region-only",
    });
    expect(res.success).toBe(true);
    expect(elm.sent).toContain(`2704${expectedKey}`);
  });
});
