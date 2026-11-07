import { describe, expect, it } from "vitest";
import {
  describeCatalogDtcs,
  listCatalogVehicleMatches,
  matchCatalogVehicle,
  projectEcus,
  resolveCatalogVehicle,
  signalsForEcu,
  useDiagDb,
  type CatalogSignal,
} from "../diag-catalog";
import { decodeCatalogSignal } from "@/lib/obd/mut-live";

const db = {
  ecusByVehicle: {
    "1108740010": {
      vkey: "1108740010",
      nameEn: "PAJERO SPORT III",
      nameRu: "Pajero Sport III",
      modelCodes: ["KR1W", "KS5W"],
      sampleVin: "MMEMCY1XXNH003447",
      ecus: [
        {
          sysKey: 1,
          nameEn: "ETACS",
          nameRu: "ETACS",
          txCanId: "0x620",
          rxCanId: "0x504",
          dtcMasterId: "05",
          variants: [
            {
              exdfFile: "ETACS.exdf",
              diagVersions: [
                { diagVersionHex: "0x0104", skey: "220015009" },
                { diagVersionHex: "0xFFFF", skey: "1500" },
              ],
            },
          ],
        },
        {
          sysKey: 2,
          nameEn: "MPI/GDI/DIESEL",
          nameRu: "Двигатель",
          txCanId: "0x7E0",
          rxCanId: "0x7E8",
          dtcMasterId: "05",
          variants: [
            {
              exdfFile: "GAS.exdf",
              diagVersions: [
                { diagVersionHex: "0x0000", skey: "10022701" },
                { diagVersionHex: "0x0104", skey: "10019901" },
              ],
            },
            {
              exdfFile: "1860D362.exdf",
              diagVersions: [{ diagVersionHex: "0xFFFF", skey: "10018801" }],
            },
          ],
        },
        {
          sysKey: 3,
          nameEn: "SRS-AIR BAG",
          nameRu: "Подушки",
          txCanId: "0x6E0",
          rxCanId: "0x51C",
          dtcMasterId: "05",
          variants: [{ exdfFile: "ORC.exdf", diagVersions: [{ diagVersionHex: "0x0001", skey: "120015102" }] }],
        },
        {
          sysKey: 4,
          nameEn: "MPI/GDI/DIESEL",
          nameRu: "Пустой",
          txCanId: "0x7E0",
          rxCanId: "0x000",
          dtcMasterId: "03",
          variants: [{ exdfFile: "OPLESS.exdf", diagVersions: [] }],
        },
      ],
    },
    "1107790064": {
      vkey: "1107790064",
      nameEn: "OUTLANDER III",
      nameRu: "Outlander III",
      modelCodes: ["GF7W"],
      ecus: [],
    },
  },
  ecuDefinitions: {
    "ETACS.exdf": {
      profiles: {
        "220015009": {
          skey: "220015009",
          dataList: [
            {
              itemNo: 1,
              nameEn: "Ignition",
              nameRu: "Зажигание",
              udsServiceId: "0x21",
              localId: "0x10",
              unitRu: "",
              bytePos: 2,
              byteLen: 1,
              byteOrder: 0,
              bitPos: -1,
              bitLen: -1,
              signed: false,
              factor: 1,
              offset: 0,
              decimals: 0,
              enums: [
                { value: 0, en: "OFF", ru: "Выкл" },
                { value: 1, en: "ON", ru: "Вкл" },
              ],
              reqMsg: "SHOULD_NOT_LEAK",
            },
          ],
          actuatorTests: [{ reqMsg: "SECRET" }],
          specialFunctions: [{ reqMsg: "SECRET" }],
        },
      },
    },
    "GAS.exdf": {
      profiles: {
        "10022701": {
          skey: "10022701",
          dataList: [
            {
              itemNo: 1,
              nameEn: "Engine speed",
              nameRu: "Обороты",
              udsServiceId: "0x21",
              localId: "0x01",
              unitRu: "r/min",
              bytePos: 2,
              byteLen: 2,
              byteOrder: 2,
              bitPos: -1,
              bitLen: -1,
              signed: false,
              factor: 0.5,
              offset: 0,
              decimals: 0,
            },
            {
              itemNo: 2,
              nameEn: "Coolant",
              nameRu: "ОЖ",
              udsServiceId: "0x21",
              localId: "0x02",
              unitRu: "°C",
              bytePos: 3,
              byteLen: 1,
              byteOrder: 2,
              bitPos: -1,
              bitLen: -1,
              signed: false,
              factor: 1,
              offset: -40,
              decimals: 0,
            },
          ],
        },
        "10019901": {
          skey: "10019901",
          dataList: [
            {
              itemNo: 1,
              nameEn: "Diesel rail",
              nameRu: "Рампа",
              udsServiceId: "0x21",
              localId: "0x11",
              unitRu: "MPa",
              bytePos: 2,
              byteLen: 2,
              byteOrder: 2,
              bitPos: -1,
              bitLen: -1,
              signed: false,
              factor: 0.1,
              offset: 0,
              decimals: 1,
            },
          ],
        },
      },
    },
    "1860D362.exdf": {
      profiles: {
        "10018801": {
          skey: "10018801",
          dataList: [
            {
              itemNo: 1,
              nameEn: "Part profile",
              nameRu: "По парт-номеру",
              udsServiceId: "0x21",
              localId: "0x01",
              unitRu: "",
              bytePos: 2,
              byteLen: 1,
              byteOrder: 2,
              bitPos: -1,
              bitLen: -1,
              signed: false,
              factor: 1,
              offset: 0,
              decimals: 0,
            },
          ],
        },
      },
    },
  },
  dtcMasters: {
    "05": {
      B1000: { en: "Inside temp.sensor performance", ru: "Датчик температуры салона" },
    },
  },
};

describe("catalog resolve", () => {
  it("matches a chassis code inside the VIN and skips empty addresses", () => {
    useDiagDb(db);
    const vehicle = resolveCatalogVehicle({ vin: "JMBXKR1WHEZ000001" });
    expect(vehicle?.vkey).toBe("1108740010");
    expect(vehicle?.ecus.map((ecu) => ecu.sysKey)).toEqual([1, 2, 3]);
    const etacs = vehicle?.ecus[0];
    const airbag = vehicle?.ecus[2];
    expect(etacs?.coding).toBe("etacs");
    expect(etacs?.canSafeClear).toBe(true);
    expect(airbag?.canSafeClear).toBe(false);
    expect(vehicle?.ecus[1]?.coding).toBe("engine");
  });

  it("matches the sample VIN and an explicit vkey", () => {
    useDiagDb(db);
    expect(matchCatalogVehicle({ vin: "MMEMCY1XXNH003447" })?.vkey).toBe("1108740010");
    expect(resolveCatalogVehicle({ vkey: "1107790064" })?.nameRu).toBe("Outlander III");
    expect(resolveCatalogVehicle({ chassis: "GF7W" })?.vkey).toBe("1107790064");
  });

  it("auto-selects a sibling VIN by sample prefix when the chassis code is not in the VIN", () => {
    useDiagDb(db);
    expect(matchCatalogVehicle({ vin: "MMEMCY1XXNH009999" })?.vkey).toBe("1108740010");
    expect(listCatalogVehicleMatches({ vin: "MMEMCY1XXNH009999" })[0]?.vkey).toBe("1108740010");
  });
});

describe("catalog signals and DTC text", () => {
  it("returns read-only data list fields and catalog DTC text", () => {
    useDiagDb(db);
    const list = signalsForEcu("1108740010", 2);
    expect(list?.skey).toBe("10022701");
    expect(list?.profileSource).toBe("catalog");
    expect(list?.profileNoteRu).toBe("Профиль по каталогу, версия блока не прочитана");
    expect(list?.signals).toHaveLength(2);
    expect(list?.signals[0]).not.toHaveProperty("reqMsg");
    expect(describeCatalogDtcs("05", ["b1000", "P0000"])).toEqual({
      B1000: { en: "Inside temp.sensor performance", ru: "Датчик температуры салона" },
    });
  });
});

describe("profile match by ECU version and part number", () => {
  it("prefers the shorter Data List whose diagnostic version matches the ECU", () => {
    useDiagDb(db);
    const list = signalsForEcu("1108740010", 2, undefined, { diagVersion: "0x0104" });
    expect(list?.skey).toBe("10019901");
    expect(list?.signals).toHaveLength(1);
    expect(list?.profileSource).toBe("version");
    expect(list?.profileNoteRu).toMatch(/0104/);
  });

  it("uses the part-number file when the version is not in the catalog", () => {
    useDiagDb(db);
    const byPart = signalsForEcu("1108740010", 2, undefined, { partNumber: "1860D362" });
    expect(byPart?.skey).toBe("10018801");
    expect(byPart?.profileSource).toBe("part");
    const missing = signalsForEcu("1108740010", 2, undefined, { diagVersion: "0ABC" });
    expect(missing?.skey).toBe("10022701");
    expect(missing?.profileSource).toBe("catalog");
    expect(missing?.profileNoteRu).toMatch(/0ABC/);
    expect(missing?.profileNoteRu).toMatch(/не найдена/);
  });
});

describe("decodeCatalogSignal", () => {
  it("scales big-endian (byteOrder=2) and little-endian (byteOrder=1) words per MutComm.dll and maps enumerations", () => {
    const rpm: CatalogSignal = {
      id: "10022701-1",
      nameEn: "Engine speed",
      nameRu: "Обороты",
      unit: "r/min",
      service: 0x21,
      localId: 0x01,
      bytePos: 2,
      byteLen: 2,
      byteOrder: 2,
      bitPos: -1,
      bitLen: -1,
      signed: false,
      factor: 0.5,
      offset: 0,
      decimals: 0,
    };
    // byteOrder = 2 (CstParamTypeH.HighLow / Big-Endian): 0x2710 = 10000 -> * 0.5 = 5000
    expect(decodeCatalogSignal(rpm, [0x01, 0x27, 0x10])?.text).toBe("5000");
    // byteOrder = 1 (CstParamTypeH.LowHigh / Little-Endian): [0x10, 0x27] -> 0x2710 = 10000 -> * 0.5 = 5000
    expect(decodeCatalogSignal({ ...rpm, byteOrder: 1 }, [0x01, 0x10, 0x27])?.text).toBe("5000");
    const ignition: CatalogSignal = {
      ...rpm,
      id: "220015009-1",
      localId: 0x10,
      byteLen: 1,
      byteOrder: 0,
      factor: 1,
      enums: [{ value: 1, en: "ON", ru: "Вкл" }],
    };
    expect(decodeCatalogSignal(ignition, [0x10, 0x01])?.text).toBe("Вкл");
  });
});

describe("projectEcus", () => {
  it("drops a zero response id", () => {
    expect(projectEcus(db.ecusByVehicle["1108740010"]!).some((ecu) => ecu.sysKey === 4)).toBe(false);
  });
});
