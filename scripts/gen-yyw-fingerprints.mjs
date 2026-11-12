import fs from "fs";

const rows = JSON.parse(
  fs.readFileSync("_inbox/ssm4-env/decoded/yyw_35xx_fingerprints.json", "utf8"),
);
const KEY = [
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

const out = [];
out.push("/**");
out.push(
  " * EyeSight (787) DID 35xx fingerprints from Y-YwPHBWHoZ.mLW — parallel to meter cgdw A0xx.",
);
out.push(` * Keys order: ${KEY.join(",")}. Generated — do not hand-edit.`);
out.push(" * 3502: 20≈US / 30≈CA destination bit in stereo-camera variant.");
out.push(" */");
out.push("");
out.push(`export const SSM4_YYW_FP_DID_KEYS = ${JSON.stringify(KEY)} as const;`);
out.push("");
out.push(
  "export type Ssm4YywFingerprint = { appliedModel: string; optionCode: string; fp: string };",
);
out.push("");
out.push("export const SSM4_YYW_FINGERPRINTS: readonly Ssm4YywFingerprint[] = [");
for (const r of rows) {
  out.push(
    `  { appliedModel: "${r.appliedModel}", optionCode: "${r.optionCode}", fp: "${r.fp}" },`,
  );
}
out.push("];");
out.push("");
out.push("const byModel = new Map<string, Ssm4YywFingerprint[]>();");
out.push("const byFp = new Map<string, Ssm4YywFingerprint[]>();");
out.push("for (const p of SSM4_YYW_FINGERPRINTS) {");
out.push("  const list = byModel.get(p.appliedModel);");
out.push("  if (list) list.push(p);");
out.push("  else byModel.set(p.appliedModel, [p]);");
out.push("  const fl = byFp.get(p.fp);");
out.push("  if (fl) fl.push(p);");
out.push("  else byFp.set(p.fp, [p]);");
out.push("}");
out.push("");
out.push(
  "export function fingerprintFromEyesightDids(didHexById: Record<string, string>): string {",
);
out.push("  return SSM4_YYW_FP_DID_KEYS.map((k) => {");
out.push(
  '    const raw = (didHexById[k] ?? didHexById[k.toLowerCase()] ?? "").trim().toUpperCase();',
);
out.push('    const tok = (raw.split(/\\s+/)[0] ?? "").slice(0, 2);');
out.push('    return tok.length === 2 ? tok : "__";');
out.push('  }).join("");');
out.push("}");
out.push("");
out.push("function packMatch(");
out.push("  hits: readonly Ssm4YywFingerprint[],");
out.push("  fp: string,",
);
out.push(
  "): { optionCode: string; appliedModel: string | null; unique: boolean; candidates: string[]; fp: string } | null {",
);
out.push("  if (!hits.length) return null;");
out.push("  const opts = [...new Set(hits.map((p) => p.optionCode))];");
out.push("  const apps = [...new Set(hits.map((p) => p.appliedModel))];");
out.push("  return {");
out.push("    optionCode: opts[0]!,");
out.push("    appliedModel: apps.length === 1 ? apps[0]! : null,");
out.push("    unique: opts.length === 1 && apps.length === 1,");
out.push(
  '    candidates: [...new Set(hits.map((p) => `${p.appliedModel}+${p.optionCode}`))],',
);
out.push("    fp,");
out.push("  };");
out.push("}");
out.push("");
out.push("/** Reverse-lookup from EyeSight 35xx dump (Applied known → Option; or global). */");
out.push("export function matchSsm4OptionFromEyesightDids(");
out.push("  appliedModel: string | null | undefined,");
out.push("  didHexById: Record<string, string>,");
out.push(
  "): { optionCode: string; appliedModel: string | null; unique: boolean; candidates: string[]; fp: string } | null {",
);
out.push("  const fp = fingerprintFromEyesightDids(didHexById);");
out.push('  if (!fp.replace(/0/g, "").length) return null;');
out.push("  const app = appliedModel?.trim().toUpperCase() || \"\";");
out.push("  if (app) {");
out.push("    const list = byModel.get(app) ?? [];");
out.push("    const exact = list.filter((p) => p.fp === fp);");
out.push("    if (exact.length) return packMatch(exact, fp);");
out.push("    const partial = list.filter((p) => {");
out.push("      for (let i = 0; i < SSM4_YYW_FP_DID_KEYS.length; i++) {");
out.push("        const got = fp.slice(i * 2, i * 2 + 2);");
out.push("        const want = p.fp.slice(i * 2, i * 2 + 2);");
out.push("        if (got && want && got !== want) return false;");
out.push("      }");
out.push(
  "      return SSM4_YYW_FP_DID_KEYS.some((_, i) => Boolean(fp.slice(i * 2, i * 2 + 2)));",
);
out.push("    });");
out.push("    return packMatch(partial, fp);");
out.push("  }");
out.push("  return packMatch(byFp.get(fp) ?? [], fp);");
out.push("}");
out.push("");
out.push("/** Destination hint from EyeSight DID 3502 (20≈US, 30≈CA for BTA stereo). */");
out.push(
  'export function eyesightDestinationHintFrom3502(byteHex: string | null | undefined): "USA" | "CANADA" | "UNKNOWN" {',
);
out.push('  const b = (byteHex ?? "").trim().toUpperCase().slice(0, 2);');
out.push('  if (b === "20") return "USA";');
out.push('  if (b === "30") return "CANADA";');
out.push('  return "UNKNOWN";');
out.push("}");
out.push("");

const path = "src/lib/obd/subaru-ssm4-yyw-fingerprints.ts";
fs.writeFileSync(path, out.join("\n"));
console.log("wrote", path, rows.length, fs.statSync(path).size);
