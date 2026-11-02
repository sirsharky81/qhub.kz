import { describe, expect, it } from "vitest";
import {
  assertRegistrationFrame,
  assertRegistrationTx,
  assertSensorId,
  changedSensorPositions,
  defaultRegistrationMode,
  didWritePlan,
  formatRegistrationClock,
  registrationFrameAllowed,
  sanitizeTpmsRecipe,
  sensorIdsFrom2128,
  tpmsEcusForAddress,
  tpmsReceptionState,
  TPMS_REGISTRATION_WINDOW_MS,
  type TpmsDidRecipe,
  type TpmsRoutineRecipe,
} from "../mitsubishi-tpms-registration";
import { runMitsubishiTpmsRoutine, writeMitsubishiTpmsIds, type TpmsRegistrationLink } from "../mitsubishi-tpms-register";

const pajero: TpmsRoutineRecipe = {
  kind: "routine",
  skey: "360023002",
  modes: [
    {
      id: "set1-06",
      set: 1,
      wheels: 4,
      method: "tool",
      nameRu: "4 колеса, триггер",
      startRequest: "31AE06",
      pollRequest: "32AE",
    },
    {
      id: "set1-00",
      set: 1,
      wheels: 4,
      method: "pressure",
      nameRu: "4 колеса, сброс давления",
      startRequest: "31AE00",
      pollRequest: "32AE",
    },
  ],
  receptionLids: ["A1", "A2", "A3", "A4", "A5"],
};

const bcm: TpmsDidRecipe = {
  kind: "did",
  skey: "4600001",
  wheels: [
    { position: "FL", labelRu: "Переднее левое", readRequest: "221041", writePrefix: "2E1041" },
    { position: "FR", labelRu: "Переднее правое", readRequest: "221042", writePrefix: "2E1042" },
    { position: "RR", labelRu: "Заднее правое", readRequest: "221043", writePrefix: "2E1043" },
    { position: "RL", labelRu: "Заднее левое", readRequest: "221044", writePrefix: "2E1044" },
  ],
};

function scriptedElm(replies: Record<string, string>): TpmsRegistrationLink & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    async sendCommand(command: string) {
      sent.push(command.toUpperCase());
      return "OK";
    },
    async setCanHeader() {},
    async sendPayload(hex: string) {
      const key = hex.replace(/\s+/g, "").toUpperCase();
      sent.push(key);
      return replies[key] ?? "NO DATA";
    },
  };
}

describe("mitsubishi TPMS registration frames", () => {
  it("keeps the factory wait at 20 minutes", () => {
    expect(TPMS_REGISTRATION_WINDOW_MS).toBe(1_200_000);
    expect(formatRegistrationClock(TPMS_REGISTRATION_WINDOW_MS)).toBe("20:00");
  });

  it("allows only registration frames that belong to the recipe", () => {
    expect(registrationFrameAllowed("31AE00")).toBe(true);
    expect(registrationFrameAllowed("31A206")).toBe(true);
    expect(registrationFrameAllowed("2802")).toBe(false);
    expect(registrationFrameAllowed("31260501")).toBe(false);
    expect(registrationFrameAllowed("2EF190AABBCCDD")).toBe(false);
    expect(assertRegistrationFrame(pajero, "31 AE 00")).toBe("31AE00");
    expect(() => assertRegistrationFrame(pajero, "31AE06")).not.toThrow();
    expect(() => assertRegistrationFrame(pajero, "3101")).toThrow(/не входит/);
    expect(() => assertRegistrationFrame(pajero, "2E1041AABBCCDD")).toThrow(/не входит/);
    expect(() => assertRegistrationTx(0x7e0)).toThrow(/773/);
    expect(assertSensorId("aa bb cc dd")).toBe("AABBCCDD");
    expect(() => assertSensorId("00000000")).toThrow(/не отправляются/);
    expect(() => assertSensorId("FFFFFFFF")).toThrow(/не отправляются/);
    expect(registrationFrameAllowed("2E104100000000")).toBe(false);
    expect(registrationFrameAllowed("2E1041FFFFFFFF")).toBe(false);
    expect(registrationFrameAllowed("2E1041AABBCCDD")).toBe(true);
  });

  it("drops a mismatched start frame while loading a recipe", () => {
    const recipe = sanitizeTpmsRecipe("632105604", {
      kind: "routine",
      modes: [
        { id: "bad", set: 1, wheels: 5, method: "tool", nameRu: "5", startRequest: "2802", pollRequest: "32A2" },
        { id: "set1-00", set: 1, wheels: 4, method: "pressure", nameRu: "4", startRequest: "31A200", pollRequest: "32A2" },
      ],
      receptionLids: ["23", "24", "25", "26", "27"],
    });
    expect(recipe?.kind).toBe("routine");
    if (recipe?.kind !== "routine") return;
    expect(recipe.modes.map((mode) => mode.startRequest)).toEqual(["31A200"]);
  });

  it("reads the reception flag at MUT bytePos 2 and diffs sensor IDs", () => {
    expect(tpmsReceptionState([0x00])).toBe("waiting");
    expect(tpmsReceptionState([0xff])).toBe("unknown");
    expect(tpmsReceptionState([0x01])).toBe("received");
    expect(tpmsReceptionState(null)).toBe("waiting");
    const before = sensorIdsFrom2128([0x00, 0x11, 0x11, 0x11, 0x11, 0x22, 0x22, 0x22, 0x22, 0x33, 0x33, 0x33, 0x33, 0x44, 0x44, 0x44, 0x44, 0xff, 0xff, 0xff, 0xff]);
    const after = sensorIdsFrom2128([0x00, 0xaa, 0xbb, 0xcc, 0xdd, 0x22, 0x22, 0x22, 0x22, 0x33, 0x33, 0x33, 0x33, 0x44, 0x44, 0x44, 0x44, 0xff, 0xff, 0xff, 0xff]);
    expect(before[0]).toBe("11111111");
    expect(changedSensorPositions(before, after)).toEqual([0]);
    expect(defaultRegistrationMode(pajero.modes)?.id).toBe("set1-00");
  });

  it("ranks the TPMS module ahead of another block on the same address", () => {
    const ranked = tpmsEcusForAddress(
      [
        { txCanId: "620", nameEn: "ETACS", nameRu: "ETACS" },
        { txCanId: "600", nameEn: "KOS/OSS", nameRu: "Шины TPMS" },
        { txCanId: "600", nameEn: "KOS", nameRu: "KOS" },
      ],
      "600",
    );
    expect(ranked.map((ecu) => ecu.nameRu)).toEqual(["Шины TPMS", "KOS"]);
  });

  it("writes only a changed BCM wheel and never a blank ID", () => {
    expect(() => didWritePlan(bcm, { FL: "11223344" }, { FL: "00000000" })).toThrow(/не отправляются/);
    const plan = didWritePlan(
      bcm,
      { FL: "11223344", FR: "AABBCCDD", RR: "01020304", RL: "05060708" },
      { FL: "AABBCCDD", FR: "AABBCCDD", RR: "", RL: "05060708" },
    );
    expect(plan.map((item) => item.request)).toEqual(["2E1041AABBCCDD"]);
  });
});

describe("mitsubishi TPMS registration runner", () => {
  it("polls reception until four IDs are accepted and does not send a foreign frame", async () => {
    const elm = scriptedElm({
      "1092": "50 92",
      "31AE00": "71 AE 00",
      "21A1": "61 A1 01",
      "21A2": "61 A2 01",
      "21A3": "61 A3 01",
      "21A4": "61 A4 01",
      "21A5": "61 A5 00",
      "2128": "61 28 00 AA BB CC DD 22 22 22 22 33 33 33 33 44 44 44 44 FF FF FF FF",
      "32AE": "72 AE",
      "1081": "50 81",
    });
    let clock = 0;
    const result = await runMitsubishiTpmsRoutine(elm, {
      tx: 0x773,
      rx: 0x774,
      recipe: pajero,
      modeId: "set1-00",
      windowMs: 5_000,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    expect(result.status).toBe("accepted");
    expect(elm.sent.filter((frame) => frame.startsWith("31"))).toEqual(["31AE00"]);
    expect(elm.sent).toContain("21A1");
    expect(elm.sent.some((frame) => frame.startsWith("2E") || frame === "3101")).toBe(false);
  });

  it("stops the poll without a cancel frame", async () => {
    const elm = scriptedElm({ "1092": "50 92", "31AE00": "71 AE 00", "1081": "50 81" });
    const result = await runMitsubishiTpmsRoutine(elm, {
      tx: 0x773,
      rx: 0x774,
      recipe: pajero,
      modeId: "set1-00",
      shouldStop: () => true,
      now: () => 0,
      sleep: async () => {},
    });
    expect(result.status).toBe("stopped");
    expect(result.noteRu).toMatch(/зажигание/);
    expect(elm.sent.filter((frame) => frame.startsWith("31"))).toEqual(["31AE00"]);
    expect(elm.sent.some((frame) => frame.startsWith("32"))).toBe(false);
  });

  it("refuses an address outside the TPMS set before opening a session", async () => {
    const elm = scriptedElm({});
    await expect(
      runMitsubishiTpmsRoutine(elm, {
        tx: 0x7e0,
        rx: 0x7e8,
        recipe: pajero,
        modeId: "set1-00",
      }),
    ).rejects.toThrow(/773/);
    expect(elm.sent).toEqual([]);
  });

  it("sends 2E only for the wheel whose ID changed", async () => {
    const elm = scriptedElm({
      "1003": "50 03",
      "221041": "62 10 41 11 22 33 44",
      "221042": "62 10 42 AA BB CC DD",
      "221043": "62 10 43 01 02 03 04",
      "221044": "62 10 44 05 06 07 08",
      "2E1041AABBCCDD": "6E 10 41",
      "1001": "50 01",
      "1081": "50 81",
    });
    const result = await writeMitsubishiTpmsIds(elm, 0x620, 0x504, bcm, {
      FL: "AABBCCDD",
      FR: "AABBCCDD",
      RR: "01020304",
      RL: "05060708",
    });
    expect(result.written.map((item) => item.position)).toEqual(["FL"]);
    expect(elm.sent.filter((frame) => frame.startsWith("2E"))).toEqual(["2E1041AABBCCDD"]);
  });

  it("rejects a blank BCM ID before any frame is sent", async () => {
    const elm = scriptedElm({});
    await expect(writeMitsubishiTpmsIds(elm, 0x620, 0x504, bcm, { FL: "00000000" })).rejects.toThrow(/не отправляются/);
    expect(elm.sent).toEqual([]);
  });
});
