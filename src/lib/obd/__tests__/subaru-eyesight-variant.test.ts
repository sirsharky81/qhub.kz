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
import {
  getSsm4YywWriteDids,
  SSM4_YYW_FP_DID_KEYS,
  SSM4_YYW_LEGACY_FP_DID_KEYS,
  SUBARU_EYESIGHT_VARIANT_READ_DIDS,
} from "../subaru-ssm4-catalog";

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

  it("blocks EyeSight writes when live schema conflicts with the Applied Model catalog schema", async () => {
    const elmRegionOnly = scriptedElm({});
    const regionOnly = await writeSubaruEyesightVariantByApplied(
      elmRegionOnly,
      "BTAEYR8",
      "C0QF",
      undefined,
      {
        writeMode: "region-only",
        detectedSchema: "309x",
      },
    );

    expect(regionOnly.success).toBe(false);
    expect(regionOnly.targetCount).toBe(0);
    expect(elmRegionOnly.sent).toHaveLength(0);
    expect(regionOnly.steps.at(-1)).toContain("считанный блок использует схему 309x");

    const elmFull = scriptedElm({});
    const full = await writeSubaruEyesightVariantByApplied(elmFull, "BTACYR8", "C0QF", undefined, {
      writeMode: "full-yyw",
      detectedSchema: "35xx",
    });

    expect(full.success).toBe(false);
    expect(full.targetCount).toBe(0);
    expect(elmFull.sent).toHaveLength(0);
    expect(full.steps.at(-1)).toContain("Applied Model BTACYR8");
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

  it("escalates to AES CGW (31 01 02 00) and ADA-032 SecurityAccess when fast CGW or initial 35xx reads yield 0 DIDs", async () => {
    const seedCgw = Array.from({ length: 16 }, (_, i) => i + 1);
    const cgwDef = SUBARU_SGP_AES128_KEYS.find((k) => k.id === "CTRL_CGW_0251_1")!;
    const cgwKeyBytes = cgwDef.keyHex.match(/../g)!.map((h) => Number.parseInt(h, 16));
    const expectedCgwKey = computeSubaruSecurityKey16ByteAesEcb(seedCgw, cgwKeyBytes)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");

    const seedEs = [
      0xf8, 0xee, 0x16, 0x09, 0xec, 0x9a, 0xb9, 0x1c,
      0x83, 0x58, 0x06, 0x0f, 0xde, 0xbc, 0x3e, 0x06,
    ];
    const esDef = SUBARU_SGP_AES128_KEYS.find((k) => k.id === "CTRL_0002_0251_1")!;
    const esKeyBytes = esDef.keyHex.match(/../g)!.map((h) => Number.parseInt(h, 16));
    const expectedEsKey = computeSubaruSecurityKey16ByteAesEcb(seedEs, esKeyBytes)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");

    const usBytes = getSsm4YywWriteDids("BTAEYR8", "U45D")!;
    let unlockedCgw = false;
    let unlockedEs = false;
    const sent: string[] = [];
    const elm: SubaruMeterWriteLink = {
      async sendCommand(cmd: string) {
        sent.push(cmd.replace(/\s+/g, "").toUpperCase());
        return "OK";
      },
      async setCanHeader() {},
      async sendPayload(hex: string) {
        const key = hex.replace(/\s+/g, "").toUpperCase();
        sent.push(key);
        if (key === "1003") return "50 03";
        if (key === "1001") return "50 01";
        if (key === "3E00") return "7E 00";
        if (key === "3101020C") return "7F 31 33";
        if (key === "220251") return "62 02 51 01";
        if (key === "2707") return "67 07 " + seedCgw.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
        if (key === `2708${expectedCgwKey}`) {
          unlockedCgw = true;
          return "67 08";
        }
        if (key === "31010200") return unlockedCgw ? "71 01 02 00" : "7F 31 33";
        if (key === "2703") {
          return unlockedCgw
            ? "67 03 " + seedEs.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")
            : "NO DATA";
        }
        if (key === `2704${expectedEsKey}`) {
          unlockedEs = true;
          return "67 04";
        }
        const match22 = key.match(/^22(35[0-9A-F]{2})$/);
        if (match22) {
          if (!unlockedEs) return "NO DATA";
          const found = usBytes.find((u) => u.did === match22[1]);
          return found ? `62 ${found.did.slice(0, 2)} ${found.did.slice(2)} ${found.byteHex}` : "NO DATA";
        }
        return "NO DATA";
      },
    };

    const res = await readSubaruEyesight35xxDids(elm, { didHexList: SSM4_YYW_FP_DID_KEYS });
    expect(res.cgwFilterRemoved).toBe(true);
    expect(Object.keys(res.didMap)).toHaveLength(16);
    expect(res.didMap["3502"]).toBe("20");
    expect(sent).toContain("31010200");
    expect(sent).toContain(`2704${expectedEsKey}`);
  });

  it("discovers alternate EyeSight CAN address (e.g. 7B7→7BF) when 787 and 784 are silent", async () => {
    const usBytes = getSsm4YywWriteDids("BTAEYR8", "U45D")!;
    let currentTx = 0;
    const elm: SubaruMeterWriteLink = {
      async sendCommand() {
        return "OK";
      },
      async setCanHeader(tx: number) {
        currentTx = tx;
      },
      async sendPayload(hex: string) {
        const key = hex.replace(/\s+/g, "").toUpperCase();
        if (currentTx === 0x763 && key === "1003") return "50 03";
        if (currentTx === 0x763 && key === "3101020C") return "71 01 02 0C";
        if (currentTx === 0x763 && key === "1001") return "50 01";
        if (currentTx === 0x7b7) {
          if (key === "1003") return "50 03";
          if (key === "1001") return "50 01";
          const m = key.match(/^22(35[0-9A-F]{2})$/);
          if (m) {
            const found = usBytes.find((u) => u.did === m[1]);
            return found ? `62 ${found.did.slice(0, 2)} ${found.did.slice(2)} ${found.byteHex}` : "NO DATA";
          }
        }
        return "NO DATA";
      },
    };

    const res = await readSubaruEyesight35xxDids(elm, { didHexList: SSM4_YYW_FP_DID_KEYS });
    expect(res.tx).toBe(0x7b7);
    expect(res.rx).toBe(0x7bf);
    expect(Object.keys(res.didMap)).toHaveLength(16);
    expect(res.didMap["3502"]).toBe("20");
  });

  it("unlocks 787 via ATFCSM0 when 787 rejects 30 08 0A FlowControl on 27 03", async () => {
    const seedEs = [
      0xf8, 0xee, 0x16, 0x09, 0xec, 0x9a, 0xb9, 0x1c,
      0x83, 0x58, 0x06, 0x0f, 0xde, 0xbc, 0x3e, 0x06,
    ];
    const esDef = SUBARU_SGP_AES128_KEYS.find((k) => k.id === "CTRL_0002_0251_32")!;
    const expectedKey = computeSubaruSecurityKey16ByteAesEcb(
      seedEs,
      esDef.keyHex.match(/../g)!.map((h) => Number.parseInt(h, 16)),
    )
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");

    const usBytes = getSsm4YywWriteDids("BTAEYR8", "U45D")!;
    let fcMode = "1";
    let currentTx = 0;
    let unlocked = false;
    const elm: SubaruMeterWriteLink = {
      async sendCommand(cmd) {
        const c = cmd.replace(/\s+/g, "").toUpperCase();
        if (c === "ATFCSM0") fcMode = "0";
        if (c === "ATFCSM1") fcMode = "1";
        return "OK";
      },
      async setCanHeader(tx) {
        currentTx = tx;
      },
      async sendPayload(hex) {
        const key = hex.replace(/\s+/g, "").toUpperCase();
        if (currentTx === 0x763) {
          if (key === "1003") return "50 03";
          if (key === "3101020C") return "71 01 02 0C";
          if (key === "1001") return "50 01";
          return "NO DATA";
        }
        if (currentTx === 0x787) {
          if (key === "1003") return "50 03";
          if (key === "1001") return "50 01";
          if (key === "3E00") return "7E 00";
          if (key === "220251") return "62 02 51 20";
          if (key === "2703") {
            if (fcMode === "0") {
              return "67 03 " + seedEs.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
            }
            return "NO DATA";
          }
          if (key === `2704${expectedKey}`) {
            unlocked = true;
            return "67 04";
          }
          const m = key.match(/^22(35[0-9A-F]{2})$/);
          if (m) {
            if (!unlocked) return "7F 22 33";
            const found = usBytes.find((u) => u.did === m[1]);
            return found ? `62 ${found.did.slice(0, 2)} ${found.did.slice(2)} ${found.byteHex}` : "NO DATA";
          }
        }
        return "NO DATA";
      },
    };

    const res = await readSubaruEyesight35xxDids(elm, { didHexList: SSM4_YYW_FP_DID_KEYS });
    expect(Object.keys(res.didMap)).toHaveLength(16);
    expect(res.didMap["3502"]).toBe("20");
  });

  it("auto-detects and reads 13 legacy DIDs (3091..309D) for BTACYR8 when 3501..3510 return NRC 31", async () => {
    const caBytes = getSsm4YywWriteDids("BTACYR8", "C0QF")!;
    expect(caBytes).toHaveLength(13);

    const replies: Record<string, string> = {
      "3101020C": "71 01 02 0C",
    };
    for (const did of SSM4_YYW_FP_DID_KEYS) {
      replies[`22${did}`] = "7F 22 31";
    }
    for (const item of caBytes) {
      replies[`22${item.did}`] = `62 ${item.did.slice(0, 2)} ${item.did.slice(2)} ${item.byteHex}`;
    }

    const elm = scriptedElm(replies);
    const res = await readSubaruEyesight35xxDids(elm, {
      didHexList: SUBARU_EYESIGHT_VARIANT_READ_DIDS,
    });

    expect(res.detectedSchema).toBe("309x");
    expect(Object.keys(res.didMap)).toHaveLength(13);
    expect(res.didMap["3094"]).toBe("03");
    expect(res.didMap["309D"]).toBe("08");
  });

  it("writes 13 legacy DIDs (3091..309D) via wildcard (C0QF -> C0**_) and region-only 3094, plus 1:1 backup", async () => {
    const caBytes = getSsm4YywWriteDids("BTACYR8", "C0QF")!;
    expect(caBytes).toHaveLength(13);

    const replies: Record<string, string> = {
      "3101020C": "71 01 02 0C",
      "2703": "67 03 " + "00 ".repeat(16).trim(),
      "2E309403": "6E 30 94",
    };
    for (const item of caBytes) {
      replies[`2E${item.did}${item.byteHex}`] = `6E ${item.did.slice(0, 2)} ${item.did.slice(2)}`;
      replies[`22${item.did}`] = `62 ${item.did.slice(0, 2)} ${item.did.slice(2)} ${item.byteHex}`;
    }

    const elmFull = scriptedElm(replies);
    const resFull = await writeSubaruEyesightVariantByApplied(elmFull, "BTACYR8", "C0QF", undefined, {
      writeMode: "full-yyw",
    });
    expect(resFull.success).toBe(true);
    expect(resFull.targetCount).toBe(13);
    expect(resFull.verifiedCount).toBe(13);
    expect(elmFull.sent.filter((s) => s.startsWith("2E309"))).toHaveLength(13);
    expect(elmFull.sent).toContain("2E309403");
    expect(elmFull.sent).toContain("2E309D08");

    const elmReg = scriptedElm(replies);
    const resReg = await writeSubaruEyesightVariantByApplied(elmReg, "BTACYR8", "C0QF", undefined, {
      writeMode: "region-only",
    });
    expect(resReg.success).toBe(true);
    expect(resReg.targetCount).toBe(1);
    expect(resReg.verifiedCount).toBe(1);
    expect(elmReg.sent.filter((s) => s.startsWith("2E"))).toEqual(["2E309403"]);

    const backup = buildSubaruEyesightBackup(
      {
        capturedAt: "2026-11-16T00:00:00.000Z",
        vin: "4S4BTGPD2N3000001",
        txHex: "787",
        rxHex: "78F",
        dids: SSM4_YYW_LEGACY_FP_DID_KEYS.map((did) => ({
          did,
          label: `DID ${did}`,
          hex: caBytes.find((c) => c.did === did)!.byteHex,
          decoded: "",
        })),
        match: {
          appliedModel: "BTACYR8",
          optionCode: "C0**_",
          unique: true,
          candidates: ["BTACYR8+C0**_"],
          fp: "0A06050301000C0403060D0308",
          schema: "309x",
          destinationHint: "CANADA",
          destinationDid: "3094",
          destinationByte: "03",
          byte3502: null,
          byte3094: "03",
          explanationRu: "",
        },
      },
      "BTACYR8",
      "C0QF",
    );
    expect(backup.restore35xxDids).toHaveLength(13);
    expect(backup.absent35xxDids).toEqual([]);
  });

  it("blocks EyeSight writes to excluded models requiring disassembly (e.g. BTAAYH8 / WMABY28)", async () => {
    const elm = scriptedElm({});
    const res = await writeSubaruEyesightVariantByApplied(elm, "BTAAYH8", "C0IC", undefined, {
      writeMode: "region-only",
    });
    expect(res.success).toBe(false);
    expect(elm.sent).toHaveLength(0);
    expect(res.steps.some((s) => s.includes("без разбора"))).toBe(true);
  });

  it("keeps 763 open without 10 01 after 31 01 02 00 when 10 01 re-enables the CGW 27-filter, then closes 763 at the end", async () => {
    const seedCgw = Array.from({ length: 16 }, (_, i) => i + 0x10);
    const cgwDef = SUBARU_SGP_AES128_KEYS.find((k) => k.id === "12265_0251_3")!;
    const expectedCgwKey = computeSubaruSecurityKey16ByteAesEcb(
      seedCgw,
      cgwDef.keyHex.match(/../g)!.map((h) => Number.parseInt(h, 16)),
    )
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");

    const seedEs = [
      0xf8, 0xee, 0x16, 0x09, 0xec, 0x9a, 0xb9, 0x1c,
      0x83, 0x58, 0x06, 0x0f, 0xde, 0xbc, 0x3e, 0x06,
    ];
    const esDef = SUBARU_SGP_AES128_KEYS.find((k) => k.id === "CTRL_0002_0251_32")!;
    const expectedEsKey = computeSubaruSecurityKey16ByteAesEcb(
      seedEs,
      esDef.keyHex.match(/../g)!.map((h) => Number.parseInt(h, 16)),
    )
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");

    const usBytes = getSsm4YywWriteDids("BTAEYR8", "U45D")!;
    let currentTx = 0;
    let cgwSaOpen = false;
    let cgwFilterOpenBy0200 = false;
    let esUnlocked = false;
    const txLog: string[] = [];

    const elm: SubaruMeterWriteLink = {
      async sendCommand() {
        return "OK";
      },
      async setCanHeader(tx) {
        currentTx = tx;
      },
      async sendPayload(hex) {
        const k = hex.replace(/\s+/g, "").toUpperCase();
        txLog.push(`${currentTx.toString(16)}:${k}`);
        if (currentTx === 0x763) {
          if (k === "1003") return "50 03";
          if (k === "1001") {
            // Returning CGW to default session re-enables the SID filter!
            cgwSaOpen = false;
            cgwFilterOpenBy0200 = false;
            return "50 01";
          }
          if (k === "3101020C") return "7F 31 78 71 01 02 0C";
          if (k === "220250") return "62 02 50 80";
          if (k === "220251") return "62 02 51 03";
          if (k === "2707") {
            return "67 07 " + seedCgw.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
          }
          if (k === `2708${expectedCgwKey}`) {
            cgwSaOpen = true;
            return "67 08";
          }
          if (k === "31010200") {
            if (!cgwSaOpen) return "7F 31 33";
            cgwFilterOpenBy0200 = true;
            return "71 01 02 00";
          }
          if (k === "22103B") return cgwFilterOpenBy0200 ? "62 10 3B 00" : "62 10 3B FF";
          return "NO DATA";
        }
        if (currentTx === 0x787) {
          if (k === "1003") return "50 03 00 32 01 C2";
          if (k === "1001") return "50 01";
          if (k === "3E00") return "7E 00";
          if (k === "220250") return "62 02 50 80";
          if (k === "220251") return "62 02 51 20";
          if (k === "22F18E") return "7F 22 31";
          if (k === "22F182") return "62 F1 82 54 45 53 54 31 32 33 34";
          if (k === "2703") {
            return cgwFilterOpenBy0200
              ? "67 03 " + seedEs.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")
              : "NO DATA";
          }
          if (k === `2704${expectedEsKey}`) {
            if (!cgwFilterOpenBy0200) return "NO DATA";
            esUnlocked = true;
            return "67 04";
          }
          const m = k.match(/^22(35[0-9A-F]{2})$/);
          if (m) {
            if (!esUnlocked) return "7F 22 33";
            const found = usBytes.find((u) => u.did === m[1]);
            return found ? `62 ${found.did.slice(0, 2)} ${found.did.slice(2)} ${found.byteHex}` : "NO DATA";
          }
        }
        return "NO DATA";
      },
    };

    const steps: string[] = [];
    const readRes = await readSubaruEyesight35xxDids(elm, {
      steps,
      didHexList: SSM4_YYW_FP_DID_KEYS,
    });

    expect(readRes.cgwFilterRemoved).toBe(true);
    expect(Object.keys(readRes.didMap)).toHaveLength(16);
    expect(readRes.didMap["3502"]).toBe("20");
    // Must have skipped redundant pre-CGW probes, unlocked 787 while 763 stayed open, and closed 763 only after 787 finished
    expect(txLog.indexOf("763:31010200")).toBeLessThan(txLog.indexOf(`787:2704${expectedEsKey}`));
    expect(txLog.lastIndexOf("763:1001")).toBeGreaterThan(txLog.indexOf("787:223510"));

    // Same keep-open behavior must allow ADA-031 writeSubaruEyesightVariantByApplied to write 3502
    esUnlocked = false;
    let written3502 = "20";
    const writeElm: SubaruMeterWriteLink = {
      ...elm,
      async sendPayload(hex) {
        const k = hex.replace(/\s+/g, "").toUpperCase();
        if (currentTx === 0x787 && k === "2E350230") {
          if (!esUnlocked) return "7F 2E 33";
          written3502 = "30";
          return "6E 35 02";
        }
        if (currentTx === 0x787 && k === "223502") {
          return `62 35 02 ${written3502}`;
        }
        return elm.sendPayload(hex);
      },
    };
    const writeRes = await writeSubaruEyesightVariantByApplied(writeElm, "BTAEYR8", "C0QF", undefined, {
      writeMode: "region-only",
    });
    expect(writeRes.success).toBe(true);
    expect(writeRes.verifiedCount).toBe(1);
    expect(written3502).toBe("30");
  });

  it("sends CTRL_0002_0251_1 (ecuKind=0x02) FIRST for KeyVersion=1 (not 12555_0251_1) and reads 3091..309D on single-shot ECU", async () => {
    const seedCgw = Array.from({ length: 16 }, (_, i) => i + 0x20);
    const cgwDef = SUBARU_SGP_AES128_KEYS.find((k) => k.id === "12265_0251_3")!;
    const expectedCgwKey = computeSubaruSecurityKey16ByteAesEcb(
      seedCgw,
      cgwDef.keyHex.match(/../g)!.map((h) => Number.parseInt(h, 16)),
    )
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");

    const seedEs = [
      0xf8, 0xee, 0x15, 0x25, 0xec, 0x9a, 0xba, 0x30,
      0x83, 0x58, 0x05, 0x23, 0xde, 0xbc, 0x3d, 0x2a,
    ];
    const esDef = SUBARU_SGP_AES128_KEYS.find((k) => k.id === "CTRL_0002_0251_1")!;
    const expectedEsKey = computeSubaruSecurityKey16ByteAesEcb(
      seedEs,
      esDef.keyHex.match(/../g)!.map((h) => Number.parseInt(h, 16)),
    )
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join("");

    let currentTx = 0;
    let cgwFilterOpen = false;
    let esUnlocked = false;
    let esLockedOut = false;
    const txLog: string[] = [];

    const elm: SubaruMeterWriteLink = {
      async sendCommand() {
        return "OK";
      },
      async setCanHeader(tx) {
        currentTx = tx;
      },
      async sendPayload(hex) {
        const k = hex.replace(/\s+/g, "").toUpperCase();
        txLog.push(`${currentTx.toString(16)}:${k}`);
        if (currentTx === 0x763) {
          if (k === "1003") return "50 03";
          if (k === "1001") {
            cgwFilterOpen = false;
            return "50 01";
          }
          if (k === "3101020C") return "7F 31 78 71 01 02 0C";
          if (k === "220250") return "62 02 50 80";
          if (k === "220251") return "62 02 51 03";
          if (k === "2707") {
            return "67 07 " + seedCgw.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
          }
          if (k === `2708${expectedCgwKey}`) {
            cgwFilterOpen = true;
            return "67 08";
          }
          if (k === "31010200") return cgwFilterOpen ? "71 01 02 00" : "7F 31 33";
          return "NO DATA";
        }
        if (currentTx === 0x787) {
          if (k === "1003") return "50 03 00 32 01 F4";
          if (k === "1001") return "50 01";
          if (k === "3E00") return "7E 00";
          if (k === "220250") return "62 02 50 80";
          if (k === "220251") return "62 02 51 01";
          if (k === "2703") {
            if (!cgwFilterOpen) return "NO DATA";
            return "67 03 " + seedEs.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
          }
          if (k.startsWith("2704")) {
            if (!cgwFilterOpen) return "NO DATA";
            if (esLockedOut) return "7F 27 36";
            if (k === `2704${expectedEsKey}`) {
              esUnlocked = true;
              return "67 04";
            }
            // Single-shot lockout on first wrong key (like live 787)
            esLockedOut = true;
            return "7F 27 36";
          }
          if (/^2235/.test(k)) return "7F 22 31";
          const m309 = k.match(/^22(309[1-9A-D])$/);
          if (m309) {
            return esUnlocked ? `62 30 ${m309[1]!.slice(2)} 1A` : "7F 22 33";
          }
        }
        return "NO DATA";
      },
    };

    const steps: string[] = [];
    const readRes = await readSubaruEyesight35xxDids(elm, {
      steps,
      didHexList: [...SSM4_YYW_FP_DID_KEYS, "3091", "3092", "3093"],
    });

    expect(readRes.securityAccessRequired).toBe(false);
    expect(readRes.didMap["3091"]).toBe("1A");
    expect(readRes.didMap["3092"]).toBe("1A");
    expect(readRes.didMap["3093"]).toBe("1A");
    expect(steps.join("\n")).toContain("CTRL_0002_0251_1");
    expect(steps.join("\n")).not.toContain("12555_0251_1");
    // Must not waste time probing 784/757/747 after 787 succeeds
    expect(txLog.some((e) => e.startsWith("784:") || e.startsWith("757:"))).toBe(false);
  });

  it("stops cleanly and skips 784/757/747 discovery when 787 returns NRC 36 lockout", async () => {
    const seedEs = Array.from({ length: 16 }, (_, i) => i + 1);
    let currentTx = 0;
    const txLog: string[] = [];

    const elm: SubaruMeterWriteLink = {
      async sendCommand() {
        return "OK";
      },
      async setCanHeader(tx) {
        currentTx = tx;
      },
      async sendPayload(hex) {
        const k = hex.replace(/\s+/g, "").toUpperCase();
        txLog.push(`${currentTx.toString(16)}:${k}`);
        if (currentTx === 0x763) {
          if (k === "1003") return "50 03";
          if (k === "3101020C") return "71 01 02 0C";
          if (k === "1001") return "50 01";
          return "NO DATA";
        }
        if (currentTx === 0x787) {
          if (k === "1003") return "50 03 00 32 01 F4";
          if (k === "1001") return "50 01";
          if (k === "3E00") return "7E 00";
          if (k === "220251") return "62 02 51 01";
          if (k === "223501") return "7F 22 33";
          if (k === "2703") {
            return "67 03 " + seedEs.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
          }
          if (k.startsWith("2704")) return "7F 27 36";
        }
        return "NO DATA";
      },
    };

    const steps: string[] = [];
    const res = await readSubaruEyesight35xxDids(elm, {
      steps,
      didHexList: SSM4_YYW_FP_DID_KEYS,
    });

    expect(res.securityAccessRequired).toBe(true);
    expect(steps.join("\n")).toContain("NRC 36");
    expect(steps.join("\n")).toContain("IG OFF");
    expect(txLog.some((e) => e.startsWith("784:") || e.startsWith("757:") || e.startsWith("747:"))).toBe(false);
  });
});
