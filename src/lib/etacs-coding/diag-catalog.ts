import fs from "node:fs";
import path from "node:path";

export type CodingLink = "etacs" | "engine" | null;

export interface CatalogVehicleSummary {
  vkey: string;
  nameEn: string;
  nameRu: string;
  modelCodes: string[];
}

export interface CatalogEcu {
  sysKey: number;
  nameEn: string;
  nameRu: string;
  txCanId: string;
  rxCanId: string;
  dtcMasterId: string;
  coding: CodingLink;
  canSafeClear: boolean;
}

export interface CatalogVehicle extends CatalogVehicleSummary {
  ecus: CatalogEcu[];
}

export interface CatalogSignalEnum {
  value: number;
  en: string;
  ru: string;
}

export interface CatalogSignal {
  id: string;
  nameEn: string;
  nameRu: string;
  unit: string;
  service: number;
  localId: number;
  bytePos: number;
  byteLen: number;
  byteOrder: number;
  bitPos: number;
  bitLen: number;
  signed: boolean;
  factor: number;
  offset: number;
  decimals: number;
  enums?: CatalogSignalEnum[];
}

export interface CatalogSignalList {
  vkey: string;
  sysKey: number;
  nameRu: string;
  nameEn: string;
  skey: string;
  txCanId: string;
  rxCanId: string;
  signals: CatalogSignal[];
}

interface RawSignal {
  itemNo: number;
  nameEn?: string;
  nameRu?: string;
  udsServiceId?: string | null;
  localId?: string | null;
  unitRu?: string;
  unitEn?: string;
  bytePos?: number;
  byteLen?: number;
  byteOrder?: number;
  bitPos?: number;
  bitLen?: number;
  signed?: boolean;
  factor?: number;
  offset?: number;
  decimals?: number;
  enums?: Array<{ value: number; en?: string; ru?: string }>;
  reqMsg?: string;
}

interface RawProfile {
  skey: string;
  dataList?: RawSignal[];
  actuatorTests?: unknown;
  specialFunctions?: unknown;
}

interface RawDefinition {
  profiles?: Record<string, RawProfile>;
}

interface RawVariant {
  exdfFile?: string;
  diagVersions?: Array<{ diagVersionHex?: string; skey?: string }>;
}

interface RawEcu {
  sysKey: number;
  nameEn?: string;
  nameRu?: string;
  txCanId?: string | null;
  rxCanId?: string | null;
  dtcMasterId?: string;
  variants?: RawVariant[];
}

interface RawVehicle {
  vkey?: string;
  key?: string;
  nameEn?: string;
  nameRu?: string;
  modelCodes?: string[];
  sampleVin?: string;
  ecus?: RawEcu[];
}

interface RawDb {
  ecusByVehicle?: Record<string, RawVehicle>;
  ecuDefinitions?: Record<string, RawDefinition>;
  dtcMasters?: Record<string, Record<string, { en?: string; ru?: string }>>;
}

const UNSAFE_NAME = /SRS|AIR\s*BAG|ABS|ASC|ASTC|WSS|SAS|STEERING ANGLE|EPS|POWER STEERING|EPB/i;
const FORBIDDEN_CLEAR_TX = new Set(["780", "7B0", "746", "787", "784", "622", "6E0", "796", "7E2", "7E5", "610"]);

let cached: RawDb | null = null;

export function resetDiagCatalogCache(): void {
  cached = null;
}

function dictionaryFile(): string {
  const fromEnv = process.env.ETACS_DICTIONARY_DIR?.trim();
  if (!fromEnv) throw new Error("Диагностический каталог недоступен");
  return path.join(path.resolve(fromEnv), "mut-diag-db.json");
}

export function loadDiagDb(): RawDb {
  if (cached) return cached;
  const file = dictionaryFile();
  if (!fs.existsSync(file)) throw new Error("Диагностический каталог недоступен");
  const db = JSON.parse(fs.readFileSync(file, "utf8")) as RawDb;
  for (const def of Object.values(db.ecuDefinitions ?? {})) {
    for (const profile of Object.values(def.profiles ?? {})) {
      delete profile.actuatorTests;
      delete profile.specialFunctions;
      for (const item of profile.dataList ?? []) delete item.reqMsg;
    }
  }
  cached = db;
  return db;
}

/** Test hook: index an already-parsed catalog without touching disk. */
export function useDiagDb(db: RawDb): void {
  cached = db;
}

function vehiclesOf(db: RawDb): RawVehicle[] {
  return Object.entries(db.ecusByVehicle ?? {}).map(([vkey, vehicle]) => ({
    ...vehicle,
    vkey: vehicle.vkey || vkey,
  }));
}

export function listCatalogVehicles(db = loadDiagDb()): CatalogVehicleSummary[] {
  return vehiclesOf(db).map((vehicle) => ({
    vkey: vehicle.vkey || "",
    nameEn: vehicle.nameEn || "",
    nameRu: vehicle.nameRu || vehicle.nameEn || "",
    modelCodes: vehicle.modelCodes ?? [],
  }));
}

function token(value: string | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function matchCatalogVehicle(
  query: { vin?: string; chassis?: string; vkey?: string },
  db = loadDiagDb(),
): RawVehicle | null {
  const vehicles = vehiclesOf(db);
  const vkey = query.vkey?.trim();
  if (vkey) {
    return vehicles.find((vehicle) => vehicle.vkey === vkey) ?? null;
  }
  const vin = token(query.vin);
  const chassis = token(query.chassis);
  const haystack = chassis || vin;
  if (!haystack) return null;
  for (const vehicle of vehicles) {
    if (vehicle.sampleVin && token(vehicle.sampleVin) === vin && vin) return vehicle;
    for (const code of vehicle.modelCodes ?? []) {
      const model = token(code);
      if (!model) continue;
      if (haystack === model || haystack.includes(model)) return vehicle;
    }
  }
  return null;
}

function parseCanId(value: string | null | undefined): string | null {
  const match = /^0x([0-9a-f]+)$/i.exec((value ?? "").trim());
  if (!match) return null;
  const id = Number.parseInt(match[1]!, 16);
  if (!Number.isFinite(id) || id <= 0 || id > 0x7ff) return null;
  return id.toString(16).toUpperCase();
}

function codingLink(nameEn: string): CodingLink {
  if (nameEn === "ETACS") return "etacs";
  if (nameEn.startsWith("MPI/") || nameEn === "MPI/GDI/DIESEL") return "engine";
  return null;
}

function canSafeClear(nameEn: string, tx: string): boolean {
  if (UNSAFE_NAME.test(nameEn)) return false;
  if (FORBIDDEN_CLEAR_TX.has(tx)) return false;
  return true;
}

export function projectEcus(vehicle: RawVehicle): CatalogEcu[] {
  const ecus: CatalogEcu[] = [];
  for (const ecu of vehicle.ecus ?? []) {
    const tx = parseCanId(ecu.txCanId);
    const rx = parseCanId(ecu.rxCanId);
    if (!tx || !rx) continue;
    const files = (ecu.variants ?? []).map((variant) => variant.exdfFile).filter(Boolean);
    if (files.length > 0 && files.every((file) => file === "OPLESS.exdf")) continue;
    const nameEn = ecu.nameEn || "";
    ecus.push({
      sysKey: ecu.sysKey,
      nameEn,
      nameRu: ecu.nameRu || nameEn,
      txCanId: tx,
      rxCanId: rx,
      dtcMasterId: (ecu.dtcMasterId || "").padStart(2, "0"),
      coding: codingLink(nameEn),
      canSafeClear: canSafeClear(nameEn, tx),
    });
  }
  return ecus;
}

export function resolveCatalogVehicle(
  query: { vin?: string; chassis?: string; vkey?: string },
  db = loadDiagDb(),
): CatalogVehicle | null {
  const vehicle = matchCatalogVehicle(query, db);
  if (!vehicle?.vkey) return null;
  return {
    vkey: vehicle.vkey,
    nameEn: vehicle.nameEn || "",
    nameRu: vehicle.nameRu || vehicle.nameEn || "",
    modelCodes: vehicle.modelCodes ?? [],
    ecus: projectEcus(vehicle),
  };
}

function preferredSkeys(ecu: RawEcu): string[] {
  const skeys: string[] = [];
  for (const variant of ecu.variants ?? []) {
    for (const version of variant.diagVersions ?? []) {
      if (!version.skey || version.diagVersionHex === "0xFFFF") continue;
      skeys.push(version.skey);
    }
  }
  return skeys;
}

function parseHexByte(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^0x([0-9a-f]+)$/i.exec(value.trim());
  if (!match) return null;
  const parsed = Number.parseInt(match[1]!, 16);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0xffff) return null;
  return parsed;
}

function projectSignal(item: RawSignal, skey: string): CatalogSignal | null {
  const service = parseHexByte(item.udsServiceId);
  const localId = parseHexByte(item.localId);
  const byteLen = item.byteLen ?? 0;
  const bytePos = item.bytePos ?? -1;
  if (service !== 0x21 && service !== 0x22) return null;
  if (localId == null || byteLen < 1 || bytePos < 2) return null;
  const enums = (item.enums ?? [])
    .filter((entry) => Number.isFinite(entry.value))
    .map((entry) => ({
      value: entry.value,
      en: entry.en || "",
      ru: entry.ru || entry.en || "",
    }));
  return {
    id: `${skey}-${item.itemNo}`,
    nameEn: item.nameEn || "",
    nameRu: item.nameRu || item.nameEn || "",
    unit: item.unitRu || item.unitEn || "",
    service,
    localId,
    bytePos,
    byteLen,
    byteOrder: item.byteOrder ?? 2,
    bitPos: item.bitPos ?? -1,
    bitLen: item.bitLen ?? -1,
    signed: Boolean(item.signed),
    factor: Number.isFinite(item.factor) ? item.factor! : 1,
    offset: Number.isFinite(item.offset) ? item.offset! : 0,
    decimals: Number.isFinite(item.decimals) ? Math.max(0, item.decimals!) : 0,
    enums: enums.length > 0 ? enums : undefined,
  };
}

export function signalsForEcu(vkey: string, sysKey: number, db = loadDiagDb()): CatalogSignalList | null {
  const vehicle = matchCatalogVehicle({ vkey }, db);
  const ecu = vehicle?.ecus?.find((item) => item.sysKey === sysKey);
  if (!vehicle || !ecu) return null;
  const projected = projectEcus(vehicle).find((item) => item.sysKey === sysKey);
  if (!projected) return null;

  const wanted = new Set(preferredSkeys(ecu));
  let best: { skey: string; items: RawSignal[] } | null = null;
  for (const variant of ecu.variants ?? []) {
    const file = variant.exdfFile;
    if (!file || file === "OPLESS.exdf") continue;
    const profiles = Object.values(db.ecuDefinitions?.[file]?.profiles ?? {});
    const preferred = profiles.filter((profile) => wanted.has(profile.skey) && (profile.dataList?.length ?? 0) > 0);
    const pool = preferred.length > 0 ? preferred : profiles;
    for (const profile of pool) {
      const count = profile.dataList?.length ?? 0;
      if (!best || count > best.items.length) {
        best = { skey: profile.skey, items: profile.dataList ?? [] };
      }
    }
  }
  if (!best) return null;
  return {
    vkey: vehicle.vkey || vkey,
    sysKey,
    nameRu: projected.nameRu,
    nameEn: projected.nameEn,
    skey: best.skey,
    txCanId: projected.txCanId,
    rxCanId: projected.rxCanId,
    signals: best.items
      .map((item) => projectSignal(item, best!.skey))
      .filter((item): item is CatalogSignal => item != null),
  };
}

export function describeCatalogDtcs(
  dtcMasterId: string,
  codes: string[],
  db = loadDiagDb(),
): Record<string, { en: string; ru: string }> {
  const master = db.dtcMasters?.[dtcMasterId.padStart(2, "0")];
  if (!master) return {};
  const out: Record<string, { en: string; ru: string }> = {};
  for (const code of codes) {
    const key = code.trim().toUpperCase();
    const hit = master[key];
    if (!hit) continue;
    out[key] = { en: hit.en || "", ru: hit.ru || hit.en || "" };
  }
  return out;
}
