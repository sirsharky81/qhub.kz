import fs from "fs";

const YYW_DEC_PATH = "_inbox/ssm4-env/decoded/Y-YwPHBWHoZ.mLW.dec";
const OUT_JSON_35XX = "_inbox/ssm4-env/decoded/yyw_35xx_fingerprints.json";
const OUT_JSON_309X = "_inbox/ssm4-env/decoded/yyw_309x_fingerprints.json";
const OUT_CSV = "_inbox/ssm4-env/decoded/EYESIGHT_yyw_catalog.csv";
const OUT_TS = "src/lib/obd/subaru-ssm4-yyw-fingerprints.ts";

const KEY_35XX = [
  "3501",
  "3502",
  "3503",
  "3504",
  "3505",
  "3506",
  "3507",
  "3508",
  "3509",
  "350A",
  "350B",
  "350C",
  "350D",
  "350E",
  "350F",
  "3510",
];

const KEY_309X = [
  "3091",
  "3092",
  "3093",
  "3094",
  "3095",
  "3096",
  "3097",
  "3098",
  "3099",
  "309A",
  "309B",
  "309C",
  "309D",
];

const KEY_9X = ["91", "92", "93", "94", "95", "96", "97", "98", "99", "9A", "9B", "9C", "9D"];

function decodeSjisLines(filePath) {
  const buf = fs.readFileSync(filePath);
  const td = new TextDecoder("shift_jis");
  return td.decode(buf).split(/\r?\n/);
}

function csvEscape(val) {
  const s = String(val ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const lines = decodeSjisLines(YYW_DEC_PATH);

let curSection = "";
let curRevision = "";

const rows35xx = [];
const rows309x = [];
const rowsCsv = [];
const seen35xx = new Set();
const seen309x = new Set();

for (const line of lines) {
  if (/^,[A-Z0-9]+,\d{2}-\d{2}/.test(line)) {
    const p = line.split(",");
    curSection = (p[1] ?? "").trim();
    curRevision = (p[2] ?? "").trim();
    continue;
  }
  if (!/^,\d+,/.test(line)) continue;
  const p = line.split(",");
  const app = (p[2] ?? "").trim().toUpperCase();
  const appliedNo = (p[3] ?? "").trim();
  const rawDest = (p[4] ?? "").trim().toUpperCase();
  const rawOp = (p[5] ?? "").trim().toUpperCase();
  if (!app) continue;

  const didPairs = [];
  for (let j = 8; j < p.length; j += 2) {
    const did = (p[j] ?? "").trim().toUpperCase();
    if (!did || did === "FFFF") break;
    const val = (p[j + 1] ?? "").trim().toUpperCase();
    didPairs.push([did, val]);
  }
  if (didPairs.length === 0 || !didPairs.every(([, v]) => /^[0-9A-F]{2}$/.test(v))) {
    continue;
  }

  const cleanDest = rawDest === "__" ? "" : rawDest;
  const optionCode = cleanDest + rawOp;
  const fp = didPairs.map(([, v]) => v).join("");
  const firstDid = didPairs[0][0];

  let schema = "";
  let destByte = "";
  if (didPairs.length === 16 && firstDid === "3501") {
    schema = "35xx";
    destByte = didPairs[1][1];
  } else if (didPairs.length === 13 && firstDid === "3091") {
    schema = "309x";
    destByte = didPairs[3][1];
  } else if (didPairs.length === 13 && firstDid === "91") {
    schema = "9x";
    destByte = didPairs[3][1];
  } else {
    continue;
  }

  const isDigit5 = /[0-9]/.test(app[4] ?? "");
  const opInputDigits = isDigit5 ? 3 : 4;
  const hasWildcard = rawOp.includes("*") || rawOp.includes("?") || rawOp.includes("_");
  const didMapObj = Object.fromEntries(didPairs);

  rowsCsv.push({
    section: curSection,
    revision: curRevision,
    schema,
    didCount: didPairs.length,
    didRange: schema === "35xx" ? "3501..3510" : schema === "309x" ? "3091..309D" : "91..9D",
    appliedModel: app,
    appliedNo,
    destCode: rawDest,
    opMask: rawOp,
    optionCode,
    hasWildcard: hasWildcard ? "YES" : "NO",
    opInputDigits,
    destByte,
    fp,
    didDump: didPairs.map(([d, v]) => `${d}=${v}`).join(" "),
    dids: didMapObj,
  });

  if (schema === "35xx") {
    const key = `${app}|${optionCode}|${fp}`;
    if (!seen35xx.has(key)) {
      seen35xx.add(key);
      rows35xx.push({ appliedModel: app, optionCode, fp });
    }
  } else if (schema === "309x") {
    const key = `${app}|${optionCode}|${fp}`;
    if (!seen309x.has(key)) {
      seen309x.add(key);
      rows309x.push({ appliedModel: app, optionCode, fp });
    }
  }
}

fs.writeFileSync(OUT_JSON_35XX, JSON.stringify(rows35xx, null, 2) + "\n");
fs.writeFileSync(OUT_JSON_309X, JSON.stringify(rows309x, null, 2) + "\n");

const csvHeaders = [
  "Section",
  "Revision",
  "DidSchema",
  "DidCount",
  "DidRange",
  "AppliedModel",
  "AppliedNo",
  "DestinationCode",
  "OptionMask",
  "FullOptionCode",
  "HasWildcard",
  "OpInputDigits",
  "DestinationByte",
  "FP",
  "DidDump",
  ...KEY_35XX,
  ...KEY_309X,
  ...KEY_9X,
];

const csvLines = [csvHeaders.join(",")];
for (const r of rowsCsv) {
  const rowCols = [
    r.section,
    r.revision,
    r.schema,
    r.didCount,
    r.didRange,
    r.appliedModel,
    r.appliedNo,
    r.destCode,
    r.opMask,
    r.optionCode,
    r.hasWildcard,
    r.opInputDigits,
    r.destByte,
    r.fp,
    r.didDump,
    ...KEY_35XX.map((k) => r.dids[k] ?? ""),
    ...KEY_309X.map((k) => r.dids[k] ?? ""),
    ...KEY_9X.map((k) => r.dids[k] ?? ""),
  ];
  csvLines.push(rowCols.map(csvEscape).join(","));
}
fs.writeFileSync(OUT_CSV, csvLines.join("\n") + "\n", "utf8");

const out = [];
out.push("/**");
out.push(
  " * EyeSight (787 / 784) DID fingerprints from Y-YwPHBWHoZ.mLW — both SGP 3501..3510 (16 DID) and legacy 3091..309D (13 DID).",
);
out.push(
  ` * SGP keys (${KEY_35XX.length}): ${KEY_35XX.join(",")}.`,
);
out.push(
  ` * Legacy keys (${KEY_309X.length}): ${KEY_309X.join(",")}.`,
);
out.push(" * Generated by scripts/gen-yyw-fingerprints.mjs — do not hand-edit.");
out.push(" * 3502: 20/21≈US, 30/31≈CA; 3094: 02≈US, 03≈CA.");
out.push(" */");
out.push("");
out.push(`export const SSM4_YYW_FP_DID_KEYS = ${JSON.stringify(KEY_35XX)} as const;`);
out.push(`export const SSM4_YYW_LEGACY_FP_DID_KEYS = ${JSON.stringify(KEY_309X)} as const;`);
out.push("");
out.push(`export type EyesightDidSchema = "35xx" | "309x";`);
out.push("");
out.push(
  "export type Ssm4YywFingerprint = { appliedModel: string; optionCode: string; fp: string };",
);
out.push("");
out.push("export const SSM4_YYW_FINGERPRINTS: readonly Ssm4YywFingerprint[] = [");
for (const r of rows35xx) {
  out.push(
    `  { appliedModel: "${r.appliedModel}", optionCode: "${r.optionCode}", fp: "${r.fp}" },`,
  );
}
out.push("];");
out.push("");
out.push("export const SSM4_YYW_LEGACY_FINGERPRINTS: readonly Ssm4YywFingerprint[] = [");
for (const r of rows309x) {
  out.push(
    `  { appliedModel: "${r.appliedModel}", optionCode: "${r.optionCode}", fp: "${r.fp}" },`,
  );
}
out.push("];");
out.push("");
out.push(`const byModel = new Map<string, Ssm4YywFingerprint[]>();
const byFp = new Map<string, Ssm4YywFingerprint[]>();
for (const p of SSM4_YYW_FINGERPRINTS) {
  const list = byModel.get(p.appliedModel);
  if (list) list.push(p);
  else byModel.set(p.appliedModel, [p]);
  const fl = byFp.get(p.fp);
  if (fl) fl.push(p);
  else byFp.set(p.fp, [p]);
}

const byLegacyModel = new Map<string, Ssm4YywFingerprint[]>();
const byLegacyFp = new Map<string, Ssm4YywFingerprint[]>();
for (const p of SSM4_YYW_LEGACY_FINGERPRINTS) {
  const list = byLegacyModel.get(p.appliedModel);
  if (list) list.push(p);
  else byLegacyModel.set(p.appliedModel, [p]);
  const fl = byLegacyFp.get(p.fp);
  if (fl) fl.push(p);
  else byLegacyFp.set(p.fp, [p]);
}

/**
 * Exact SSM4 getOpDigit (FHIUtilityCtrlNK.dll @ 0x10022360) rule:
 * 5th character of Applied Model is numeric (0-9) -> 3-char Option input (flgOpDigit3=1, e.g. PAC/RIC);
 * otherwise (letter, e.g. Y/K/L in BTACYR8 / BTAEYR8) -> 4-char Option input (2-char dest + 2-char op).
 */
export function getSsm4YywExpectedOpDigits(appliedModel: string): 3 | 4 {
  const app = appliedModel.trim().toUpperCase();
  return /[0-9]/.test(app[4] ?? "") ? 3 : 4;
}

/** Determine whether an Applied Model uses 16 DIDs (3501..3510) or 13 legacy DIDs (3091..309D) in Y-Yw. */
export function getSsm4YywSchemaForModel(
  appliedModel: string | null | undefined,
): EyesightDidSchema | null {
  const app = appliedModel?.trim().toUpperCase() || "";
  if (!app) return null;
  if (byModel.has(app)) return "35xx";
  if (byLegacyModel.has(app)) return "309x";
  return null;
}

export function getSsm4YywDidKeysForSchema(
  schema: EyesightDidSchema,
): readonly string[] {
  return schema === "309x" ? SSM4_YYW_LEGACY_FP_DID_KEYS : SSM4_YYW_FP_DID_KEYS;
}

/** Wildcard matcher mirroring FHIUtilityCtrlNK.dll @ 0x1000cc90 ('*' = any chars, '?' = 1 char). */
function wildcardMatch(pattern: string, text: string): boolean {
  const esc = pattern.replace(/[.+^\${}()|[\\]\\\\]/g, "\\\\$&");
  const regexStr = "^" + esc.replace(/\\*/g, ".*").replace(/\\?/g, ".") + "$";
  return new RegExp(regexStr, "i").test(text);
}

/**
 * Exact SSM4 changeVariantExtend (FHIUtilityCtrlNK.dll @ 0x10049ca0) Option Code matcher:
 * - For 4-char models (5th char alpha, e.g. BTACYR8, BT9ALDL):
 *   first 2 chars = Destination ('C0', 'U4', 'KS'), remaining 2 chars matched against Y-Yw OP mask
 *   with trailing '_' stripped (so '5X_' -> '5X', '**_' -> '**' wildcard).
 * - For 3-char models (5th char digit, e.g. BN9F47C, GU6A5AL):
 *   3-char code matched directly against OP mask (e.g. 'RIC', '***').
 */
export function doesSsm4YywOptionMatchPattern(
  appliedModel: string,
  catalogOptionCode: string,
  userOptionCode: string,
): boolean {
  const app = appliedModel.trim().toUpperCase();
  const cat = catalogOptionCode.trim().toUpperCase();
  const rawUser = userOptionCode.trim().toUpperCase();
  if (!cat || !rawUser) return false;
  if (cat === rawUser) return true;

  const isDigit5 = getSsm4YywExpectedOpDigits(app) === 3;
  if (isDigit5) {
    if (rawUser.length < 3) return false;
    return wildcardMatch(cat, rawUser.slice(0, 3));
  }

  const userNorm = rawUser.length === 5 && rawUser.endsWith("_") ? rawUser.slice(0, 4) : rawUser;
  if (userNorm.length < 4) return false;
  const catDest = cat.slice(0, 2);
  const catOpRaw = cat.slice(2);
  const catOp = catOpRaw.endsWith("_") ? catOpRaw.slice(0, -1) : catOpRaw;
  const userDest = userNorm.slice(0, 2);
  const userOp = userNorm.slice(2, 4);
  if (catDest !== userDest) return false;
  return wildcardMatch(catOp, userOp);
}

export function isSsm4YywWildcardOption(optionCode: string): boolean {
  return optionCode.includes("*") || optionCode.includes("?") || optionCode.includes("_");
}

export function fingerprintFromEyesightDids(
  didHexById: Record<string, string>,
  keys: readonly string[] = SSM4_YYW_FP_DID_KEYS,
): string {
  return keys
    .map((k) => {
      const raw = (didHexById[k] ?? didHexById[k.toLowerCase()] ?? "").trim().toUpperCase();
      const tok = (raw.split(/\\s+/)[0] ?? "").slice(0, 2);
      return /^[0-9A-F]{2}$/.test(tok) ? tok : "__";
    })
    .join("");
}

export function detectEyesightSchemaFromDids(
  didHexById: Record<string, string>,
  hintAppliedModel?: string | null,
): EyesightDidSchema {
  let count35xx = 0;
  for (const k of SSM4_YYW_FP_DID_KEYS) {
    const raw = (didHexById[k] ?? didHexById[k.toLowerCase()] ?? "").trim().toUpperCase();
    const tok = (raw.split(/\\s+/)[0] ?? "").slice(0, 2);
    if (/^[0-9A-F]{2}$/.test(tok)) count35xx++;
  }
  let count309x = 0;
  for (const k of SSM4_YYW_LEGACY_FP_DID_KEYS) {
    const raw = (didHexById[k] ?? didHexById[k.toLowerCase()] ?? "").trim().toUpperCase();
    const tok = (raw.split(/\\s+/)[0] ?? "").slice(0, 2);
    if (/^[0-9A-F]{2}$/.test(tok)) count309x++;
  }
  if (count35xx > 0 && count309x === 0) return "35xx";
  if (count309x > 0 && count35xx === 0) return "309x";
  if (count309x > count35xx) return "309x";
  if (count35xx > 0) return "35xx";
  return getSsm4YywSchemaForModel(hintAppliedModel) ?? "35xx";
}

function packMatch(
  hits: readonly Ssm4YywFingerprint[],
  fp: string,
  schema: EyesightDidSchema,
): {
  optionCode: string;
  appliedModel: string | null;
  unique: boolean;
  candidates: string[];
  fp: string;
  schema: EyesightDidSchema;
} | null {
  if (!hits.length) return null;
  const opts = [...new Set(hits.map((p) => p.optionCode))];
  const apps = [...new Set(hits.map((p) => p.appliedModel))];
  return {
    optionCode: opts[0]!,
    appliedModel: apps.length === 1 ? apps[0]! : null,
    unique: opts.length === 1 && apps.length === 1,
    candidates: [...new Set(hits.map((p) => \`\${p.appliedModel}+\${p.optionCode}\`))],
    fp,
    schema,
  };
}

/** Reverse-lookup from EyeSight 35xx or 309x dump (Applied known -> Option; or global). */
export function matchSsm4OptionFromEyesightDids(
  appliedModel: string | null | undefined,
  didHexById: Record<string, string>,
): {
  optionCode: string;
  appliedModel: string | null;
  unique: boolean;
  candidates: string[];
  fp: string;
  schema: EyesightDidSchema;
} | null {
  const schema = detectEyesightSchemaFromDids(didHexById, appliedModel);
  const keys = getSsm4YywDidKeysForSchema(schema);
  const fp = fingerprintFromEyesightDids(didHexById, keys);
  if (!fp.replace(/[_0]/g, "").length) return null;
  const modelMap = schema === "309x" ? byLegacyModel : byModel;
  const fpMap = schema === "309x" ? byLegacyFp : byFp;
  const app = appliedModel?.trim().toUpperCase() || "";
  if (app && modelMap.has(app)) {
    const list = modelMap.get(app) ?? [];
    const exact = list.filter((p) => p.fp === fp);
    if (exact.length) return packMatch(exact, fp, schema);
    const partial = list.filter((p) => {
      let hasKnown = false;
      for (let i = 0; i < keys.length; i++) {
        const got = fp.slice(i * 2, i * 2 + 2);
        const want = p.fp.slice(i * 2, i * 2 + 2);
        if (got === "__") continue;
        hasKnown = true;
        if (want && got !== want) return false;
      }
      return hasKnown;
    });
    return packMatch(partial, fp, schema);
  }
  return packMatch(fpMap.get(fp) ?? [], fp, schema);
}

/** Destination hint from EyeSight DID 3502 (20/21≈US, 30/31≈CA for SGP stereo). */
export function eyesightDestinationHintFrom3502(
  byteHex: string | null | undefined,
): "USA" | "CANADA" | "UNKNOWN" {
  const b = (byteHex ?? "").trim().toUpperCase().slice(0, 2);
  if (b === "20" || b === "21") return "USA";
  if (b === "30" || b === "31") return "CANADA";
  return "UNKNOWN";
}

/** Destination hint from legacy EyeSight DID 3094 (02≈US, 03≈CA). */
export function eyesightDestinationHintFrom3094(
  byteHex: string | null | undefined,
): "USA" | "CANADA" | "UNKNOWN" {
  const b = (byteHex ?? "").trim().toUpperCase().slice(0, 2);
  if (b === "02") return "USA";
  if (b === "03") return "CANADA";
  return "UNKNOWN";
}

/**
 * Forward Y-Yw lookup for SSM4 Selection of Parameter (ADA-031 / ADA-002 / ADA-038).
 * Mirrors FHIUtilityCtrlNK.dll changeVariantExtend: tries exact match first, then wildcard match ('**_','5X_','***').
 */
export function lookupSsm4YywFingerprint(
  appliedModel: string,
  optionCode: string,
  options?: { exactOnly?: boolean },
): (Ssm4YywFingerprint & { schema: EyesightDidSchema }) | null {
  const app = appliedModel.trim().toUpperCase();
  const opt = optionCode.trim().toUpperCase();
  if (!app || !opt) return null;

  const checkList = (
    list: readonly Ssm4YywFingerprint[],
    schema: EyesightDidSchema,
  ): (Ssm4YywFingerprint & { schema: EyesightDidSchema }) | null => {
    const exact = list.find((p) => p.optionCode === opt);
    if (exact) return { ...exact, schema };
    if (options?.exactOnly) return null;
    const wild = list.find((p) => doesSsm4YywOptionMatchPattern(app, p.optionCode, opt));
    return wild ? { ...wild, schema } : null;
  };

  const sgpList = byModel.get(app);
  if (sgpList?.length) {
    const hit = checkList(sgpList, "35xx");
    if (hit) return hit;
  }
  const legList = byLegacyModel.get(app);
  if (legList?.length) {
    const hit = checkList(legList, "309x");
    if (hit) return hit;
  }
  return null;
}

export function listSsm4YywOptionsForAppliedModel(
  appliedModel: string,
): readonly (Ssm4YywFingerprint & { schema: EyesightDidSchema })[] {
  const app = appliedModel.trim().toUpperCase();
  const sgp = byModel.get(app);
  if (sgp?.length) return sgp.map((r) => ({ ...r, schema: "35xx" as const }));
  const leg = byLegacyModel.get(app);
  if (leg?.length) return leg.map((r) => ({ ...r, schema: "309x" as const }));
  return [];
}

/** Split Y-Yw fp into per-DID single-byte hex (3501..3510 or 3091..309D). */
export function yywFingerprintToDidByteMap(
  fp: string,
  schema?: EyesightDidSchema,
): Record<string, string> {
  const clean = fp.trim().toUpperCase();
  const resolvedSchema: EyesightDidSchema =
    schema ?? (clean.length === SSM4_YYW_LEGACY_FP_DID_KEYS.length * 2 ? "309x" : "35xx");
  const keys = getSsm4YywDidKeysForSchema(resolvedSchema);
  const out: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    const byte = clean.slice(i * 2, i * 2 + 2);
    if (byte.length === 2) out[keys[i]!] = byte;
  }
  return out;
}

/** Exact list of 16 (3501..3510) or 13 (3091..309D) \`{ did, byteHex }\` writes from Y-Yw (with wildcard support). */
export function getSsm4YywWriteDids(
  appliedModel: string,
  optionCode: string,
): { did: string; byteHex: string }[] | null {
  const row = lookupSsm4YywFingerprint(appliedModel, optionCode);
  if (!row) return null;
  const keys = getSsm4YywDidKeysForSchema(row.schema);
  const map = yywFingerprintToDidByteMap(row.fp, row.schema);
  const out: { did: string; byteHex: string }[] = [];
  for (const did of keys) {
    const byteHex = map[did];
    if (byteHex && /^[0-9A-F]{2}$/.test(byteHex)) {
      out.push({ did, byteHex });
    }
  }
  return out;
}

export interface Ssm4EyesightCatalogByteDiff {
  did: string;
  car: string;
  catalog: string;
}

export interface Ssm4EyesightAppliedRowDiff {
  optionCode: string;
  schema: EyesightDidSchema;
  identical: boolean;
  unreadSlots: number;
  diffs: Ssm4EyesightCatalogByteDiff[];
}

export interface Ssm4EyesightCatalogSummary {
  appliedModel: string;
  schema: EyesightDidSchema;
  closestOptionCode: string | null;
  closestDiffCount: number;
  rows: Ssm4EyesightAppliedRowDiff[];
}

/**
 * Compare live EyeSight (3501..3510 or 3091..309D) dump against every Y-Yw row for one Applied Model.
 * Unread slots ('__') are skipped so partial dumps still show real mismatches.
 */
export function diffEyesightAgainstAppliedCatalog(
  appliedModel: string,
  didHexById: Record<string, string>,
): Ssm4EyesightAppliedRowDiff[] {
  const app = appliedModel.trim().toUpperCase();
  const rows = listSsm4YywOptionsForAppliedModel(app);
  if (rows.length === 0) return [];
  const schema = rows[0]!.schema;
  const keys = getSsm4YywDidKeysForSchema(schema);
  const got = fingerprintFromEyesightDids(didHexById, keys);
  return rows.map((row) => {
    const diffs: Ssm4EyesightCatalogByteDiff[] = [];
    let unreadSlots = 0;
    for (let i = 0; i < keys.length; i++) {
      const car = got.slice(i * 2, i * 2 + 2);
      const catalog = row.fp.slice(i * 2, i * 2 + 2);
      if (car === "__") {
        unreadSlots++;
        continue;
      }
      if (car !== catalog) {
        diffs.push({ did: keys[i]!, car, catalog });
      }
    }
    return {
      optionCode: row.optionCode,
      schema,
      identical: diffs.length === 0 && unreadSlots === 0,
      unreadSlots,
      diffs,
    };
  });
}

export function summarizeEyesightCatalogComparison(
  appliedModel: string,
  didHexById: Record<string, string>,
): Ssm4EyesightCatalogSummary {
  const app = appliedModel.trim().toUpperCase();
  const schema = getSsm4YywSchemaForModel(app) ?? detectEyesightSchemaFromDids(didHexById, app);
  const rows = diffEyesightAgainstAppliedCatalog(app, didHexById);
  let closestOptionCode: string | null = null;
  let closestDiffCount = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    if (row.diffs.length < closestDiffCount) {
      closestDiffCount = row.diffs.length;
      closestOptionCode = row.optionCode;
    }
  }
  return {
    appliedModel: app,
    schema,
    closestOptionCode,
    closestDiffCount: Number.isFinite(closestDiffCount) ? closestDiffCount : 0,
    rows,
  };
}

export interface EyesightOptionInputGuide {
  appliedModel: string;
  schema: EyesightDidSchema | null;
  didRange: "3501..3510" | "3091..309D";
  didCount: 16 | 13;
  destinationDid: "3502" | "3094";
  expectedOptionLength: 3 | 4;
  hasWildcards: boolean;
  catalogOptions: string[];
  resolvedCatalogOption: string | null;
  resolvedByWildcard: boolean;
  recommendedCanadaInput: string | null;
  recommendedUsInputs: string[];
  hintRu: string;
}

/**
 * Explains what Option Code to enter in SSM4 / QHub for a given Applied Model (handling '**_' / '5X_' wildcards).
 */
export function explainEyesightOptionInput(
  appliedModel: string,
  optionCodeInput?: string | null,
  cgdwOptionCodes?: readonly string[],
): EyesightOptionInputGuide {
  const app = appliedModel.trim().toUpperCase();
  const opt = (optionCodeInput ?? "").trim().toUpperCase();
  const schema = getSsm4YywSchemaForModel(app);
  const resolvedSchema: EyesightDidSchema = schema ?? "35xx";
  const didRange = resolvedSchema === "309x" ? "3091..309D" : "3501..3510";
  const didCount = resolvedSchema === "309x" ? 13 : 16;
  const destinationDid = resolvedSchema === "309x" ? "3094" : "3502";
  const expectedOptionLength = getSsm4YywExpectedOpDigits(app);
  const rows = listSsm4YywOptionsForAppliedModel(app);
  const catalogOptions = rows.map((r) => r.optionCode);
  const hasWildcards = catalogOptions.some(isSsm4YywWildcardOption);
  const hit = opt ? lookupSsm4YywFingerprint(app, opt) : null;
  const resolvedCatalogOption = hit?.optionCode ?? null;
  const resolvedByWildcard = Boolean(
    hit && hit.optionCode !== opt && isSsm4YywWildcardOption(hit.optionCode),
  );

  const cgdwUpper = (cgdwOptionCodes ?? []).map((c) => c.trim().toUpperCase());
  const cgdwCa = cgdwUpper.find((c) => c.startsWith("C0") || c.startsWith("C5")) ?? null;
  const yywCaRaw =
    catalogOptions.find((c) => c.startsWith("C0") || c.startsWith("C5")) ?? null;
  const recommendedCanadaInput =
    cgdwCa && (!yywCaRaw || lookupSsm4YywFingerprint(app, cgdwCa))
      ? cgdwCa
      : yywCaRaw
        ? yywCaRaw.includes("*")
          ? \`\${yywCaRaw.slice(0, 2)}QF\`
          : yywCaRaw.replace(/_$/, "")
        : null;

  const cgdwUsList = cgdwUpper.filter((c) => c.startsWith("U4") || c.startsWith("U5"));
  const yywUsRaw = catalogOptions.filter((c) => c.startsWith("U4") || c.startsWith("U5"));
  const recommendedUsInputs =
    cgdwUsList.length > 0
      ? cgdwUsList
      : yywUsRaw.map((c) => (c.includes("*") ? \`\${c.slice(0, 2)}5D\` : c.replace(/_$/, "")));

  let hintRu: string;
  if (!schema) {
    hintRu = app.length === 7
      ? \`Модели \${app} нет в справочнике EyeSight Y-YwPHBWHoZ.mLW — используйте режим «Только регион (\${destinationDid})» или бэкап.\`
      : "Введите 7-значный Applied Model для подсказки по EyeSight.";
  } else if (hasWildcards) {
    const schemaText =
      resolvedSchema === "309x"
        ? "Legacy EyeSight: 13 DID (3091..309D, байт рынка 3094)"
        : "SGP EyeSight: 16 DID (3501..3510, байт рынка 3502)";
    const specificNonWild = catalogOptions.filter(
      (c) => c.includes("_") && !c.includes("*"),
    );
    const specificNote =
      specificNonWild.length > 0
        ? \` Исключения с прямым совпадением: \${specificNonWild.map((c) => c.replace(/_$/, "")).join(", ")}.\`
        : "";
    const resolvedNote = resolvedCatalogOption
      ? resolvedByWildcard
        ? \` Код \${opt} автоматически сопоставлен со строкой \${resolvedCatalogOption}.\`
        : \` Код \${opt} совпадает со строкой \${resolvedCatalogOption}.\`
      : opt
        ? \` Код \${opt} не подходит под шаблоны (\${catalogOptions.join(", ")}).\`
        : "";
    hintRu =
      \`\${schemaText}. В базе Y-Yw используются маски (\${catalogOptions.join(", ")}): звёздочки «*» и «_» вводить НЕ нужно — вводите обычный \${expectedOptionLength}-значный код (например Канада \${recommendedCanadaInput ?? "C0QF"}, США \${recommendedUsInputs.join(" / ") || "U45D"}).\${specificNote}\${resolvedNote}\`;
  } else {
    const resolvedNote = resolvedCatalogOption
      ? \` Код \${opt} найден в Y-Yw (\${resolvedCatalogOption}).\`
      : opt
        ? \` Кода \${opt} нет в Y-Yw (\${catalogOptions.join(", ")}) — выберите код из списка или режим «Только регион (\${destinationDid})».\`
        : "";
    hintRu = \`SGP EyeSight: 16 DID (\${didRange}, байт рынка \${destinationDid}). Вводите точный \${expectedOptionLength}-значный Option Code из Y-Yw (\${catalogOptions.join(", ")}).\${resolvedNote}\`;
  }

  return {
    appliedModel: app,
    schema,
    didRange,
    didCount,
    destinationDid,
    expectedOptionLength,
    hasWildcards,
    catalogOptions,
    resolvedCatalogOption,
    resolvedByWildcard,
    recommendedCanadaInput,
    recommendedUsInputs,
    hintRu,
  };
}
`);

fs.writeFileSync(OUT_TS, out.join("\n"));
console.log(
  "Generated:",
  OUT_TS,
  "35xx:",
  rows35xx.length,
  "309x:",
  rows309x.length,
  "csv:",
  rowsCsv.length,
  "tsBytes:",
  fs.statSync(OUT_TS).size,
);
