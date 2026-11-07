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
  /** Valid MUT-III SKEYs listed for this ECU on this vehicle in DiagSystem.exdf. */
  skeys?: string[];
}

export interface CatalogVehicle extends CatalogVehicleSummary {
  ecus: CatalogEcu[];
}

export interface CatalogSignalEnum {
  value: number;
  en: string;
  ru: string;
}

export interface CatalogSignalScale {
  lowBound: number;
  upBound: number;
  factor: number;
  offset: number;
  textEn?: string;
  textRu?: string;
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
  /** MUT-III CstParamTypeH: 1 = LowHigh (Little-Endian), 2 = HighLow (Big-Endian). */
  byteOrder: number;
  bitPos: number;
  bitLen: number;
  bitMask?: number;
  /** MUT-III CstCodeType: 0 = BCD, 1 = Type_2C, 2 = SignNumber, 3 = UnsignNumber. */
  codeType?: number;
  signed: boolean;
  factor: number;
  offset: number;
  decimals: number;
  enums?: CatalogSignalEnum[];
  scales?: CatalogSignalScale[];
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
  /** `version` / `part` came from the ECU. `catalog` is the longest Data List fallback. */
  profileSource: "version" | "part" | "catalog";
  profileNoteRu: string;
}

export interface CatalogSignalQuery {
  diagVersion?: string | null;
  partNumber?: string | null;
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
  bitMask?: number;
  codeType?: number;
  signed?: boolean;
  factor?: number;
  offset?: number;
  decimals?: number;
  enums?: Array<{ value: number; en?: string; ru?: string }>;
  scales?: Array<{
    lowBound: number;
    upBound: number;
    factor?: number;
    offset?: number;
    textEn?: string;
    textRu?: string;
  }>;
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

function commonPrefixLength(left: string, right: string): number {
  const n = Math.min(left.length, right.length);
  let i = 0;
  while (i < n && left[i] === right[i]) i += 1;
  return i;
}

function toSummary(vehicle: RawVehicle): CatalogVehicleSummary {
  return {
    vkey: vehicle.vkey || "",
    nameEn: vehicle.nameEn || "",
    nameRu: vehicle.nameRu || vehicle.nameEn || "",
    modelCodes: vehicle.modelCodes ?? [],
  };
}

function scoreVehicleMatch(vehicle: RawVehicle, vin: string, chassis: string): number {
  let score = 0;
  const sample = token(vehicle.sampleVin);
  if (vin && sample && sample === vin) score = Math.max(score, 1000);
  if (chassis) {
    for (const code of vehicle.modelCodes ?? []) {
      const model = token(code);
      if (!model) continue;
      if (chassis === model || chassis.includes(model) || model.includes(chassis)) {
        score = Math.max(score, 900);
      }
    }
  }
  if (vin) {
    for (const code of vehicle.modelCodes ?? []) {
      const model = token(code);
      if (model.length >= 4 && vin.includes(model)) score = Math.max(score, 500 + model.length);
    }
    if (sample.length >= 8) {
      const prefix = commonPrefixLength(sample, vin);
      if (prefix >= 8) score = Math.max(score, 100 + prefix * 10);
    }
  }
  return score;
}

export interface CatalogVehicleMatch extends CatalogVehicleSummary {
  score: number;
}

export function listCatalogVehicleMatches(
  query: { vin?: string; chassis?: string },
  db = loadDiagDb(),
): CatalogVehicleMatch[] {
  const vin = token(query.vin);
  const chassis = token(query.chassis);
  if (!vin && !chassis) return [];
  const matches: CatalogVehicleMatch[] = [];
  for (const vehicle of vehiclesOf(db)) {
    const score = scoreVehicleMatch(vehicle, vin, chassis);
    if (score <= 0 || !vehicle.vkey) continue;
    matches.push({ ...toSummary(vehicle), score });
  }
  matches.sort((left, right) => right.score - left.score || left.vkey.localeCompare(right.vkey));
  return matches;
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
  const matches = listCatalogVehicleMatches(query, db);
  const best = matches[0];
  if (!best) return null;
  if (matches[1] && matches[1].score === best.score) return null;
  return vehicles.find((vehicle) => vehicle.vkey === best.vkey) ?? null;
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

function allSkeysOf(ecu: RawEcu): string[] {
  const specific: string[] = [];
  const fallback: string[] = [];
  for (const variant of ecu.variants ?? []) {
    for (const version of variant.diagVersions ?? []) {
      const sk = version.skey?.trim();
      if (!sk) continue;
      if (version.diagVersionHex === "0xFFFF") {
        if (!fallback.includes(sk)) fallback.push(sk);
      } else if (!specific.includes(sk)) {
        specific.push(sk);
      }
    }
  }
  return [...specific, ...fallback];
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
    const skeys = allSkeysOf(ecu);
    ecus.push({
      sysKey: ecu.sysKey,
      nameEn,
      nameRu: ecu.nameRu || nameEn,
      txCanId: tx,
      rxCanId: rx,
      dtcMasterId: (ecu.dtcMasterId || "").padStart(2, "0"),
      coding: codingLink(nameEn),
      canSafeClear: canSafeClear(nameEn, tx),
      ...(skeys.length > 0 ? { skeys } : {}),
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
  const scales = (item.scales ?? [])
    .filter((scale) => Number.isFinite(scale.lowBound) && Number.isFinite(scale.upBound))
    .map((scale) => ({
      lowBound: scale.lowBound,
      upBound: scale.upBound,
      factor: Number.isFinite(scale.factor) ? scale.factor! : 1,
      offset: Number.isFinite(scale.offset) ? scale.offset! : 0,
      textEn: scale.textEn,
      textRu: scale.textRu || scale.textEn,
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
    ...(item.bitMask != null && item.bitMask >= 0 ? { bitMask: item.bitMask } : {}),
    ...(item.codeType != null ? { codeType: item.codeType } : {}),
    signed: Boolean(item.signed),
    factor: Number.isFinite(item.factor) ? item.factor! : 1,
    offset: Number.isFinite(item.offset) ? item.offset! : 0,
    decimals: Number.isFinite(item.decimals) ? Math.max(0, item.decimals!) : 0,
    enums: enums.length > 0 ? enums : undefined,
    scales: scales.length > 0 ? scales : undefined,
  };
}

function normalizeDiagVersion(value: string | null | undefined): string | null {
  if (!value) return null;
  const hex = value.replace(/^0x/i, "").replace(/[^0-9a-f]/gi, "");
  if (!hex) return null;
  return hex.toUpperCase().padStart(4, "0").slice(-4);
}

interface ProfileCandidate {
  skey: string;
  items: RawSignal[];
  versionHit: boolean;
  partHit: boolean;
  listed: boolean;
}

export function signalsForEcu(
  vkey: string,
  sysKey: number,
  db = loadDiagDb(),
  query?: CatalogSignalQuery,
): CatalogSignalList | null {
  const vehicle = matchCatalogVehicle({ vkey }, db);
  const ecu = vehicle?.ecus?.find((item) => item.sysKey === sysKey);
  if (!vehicle || !ecu) return null;
  const projected = projectEcus(vehicle).find((item) => item.sysKey === sysKey);
  if (!projected) return null;

  const wanted = new Set(preferredSkeys(ecu));
  const wantedVersion = normalizeDiagVersion(query?.diagVersion);
  const part = (query?.partNumber ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const candidates: ProfileCandidate[] = [];
  for (const variant of ecu.variants ?? []) {
    const file = variant.exdfFile;
    if (!file || file === "OPLESS.exdf") continue;
    const versionSkeys = new Set(
      (variant.diagVersions ?? [])
        .filter(
          (version) =>
            wantedVersion != null &&
            version.diagVersionHex !== "0xFFFF" &&
            normalizeDiagVersion(version.diagVersionHex) === wantedVersion,
        )
        .map((version) => version.skey),
    );
    const partHit = part.length >= 6 && file.toUpperCase().includes(part);
    for (const profile of Object.values(db.ecuDefinitions?.[file]?.profiles ?? {})) {
      const items = profile.dataList ?? [];
      if (items.length === 0) continue;
      candidates.push({
        skey: profile.skey,
        items,
        versionHit: versionSkeys.has(profile.skey),
        partHit,
        listed: wanted.has(profile.skey),
      });
    }
  }
  const richest = (pool: ProfileCandidate[]) =>
    [...pool].sort((left, right) => right.items.length - left.items.length)[0] ?? null;
  const byVersion = richest(candidates.filter((item) => item.versionHit));
  const byPart = byVersion ? null : richest(candidates.filter((item) => item.partHit));
  const listed = candidates.filter((item) => item.listed);
  const byCatalog = byVersion || byPart ? null : richest(listed.length > 0 ? listed : candidates);
  const best = byVersion ?? byPart ?? byCatalog;
  if (!best) return null;
  const profileSource: CatalogSignalList["profileSource"] = byVersion ? "version" : byPart ? "part" : "catalog";
  const profileNoteRu =
    profileSource === "version"
      ? `Профиль ${best.skey} по версии блока ${wantedVersion}`
      : profileSource === "part"
        ? `Профиль ${best.skey} по парт-номеру ${part}`
        : wantedVersion
          ? `Профиль по каталогу (${best.skey}): версия ${wantedVersion} в базе не найдена`
          : "Профиль по каталогу, версия блока не прочитана";
  return {
    vkey: vehicle.vkey || vkey,
    sysKey,
    nameRu: projected.nameRu,
    nameEn: projected.nameEn,
    skey: best.skey,
    txCanId: projected.txCanId,
    rxCanId: projected.rxCanId,
    profileSource,
    profileNoteRu,
    signals: best.items
      .map((item) => projectSignal(item, best.skey))
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
