import fs from "fs";

const raw = JSON.parse(
  fs.readFileSync("_inbox/ssm4-env/decoded/cgdw_a0xx_fingerprints_full.json", "utf8"),
);
const KEY = raw.KEY;
const rows = raw.rows;

const out = [];
out.push("/**");
out.push(
  " * Full meter A0xx fingerprints from cgdwPHBWHoZ.mLW (all DIDs in each catalog row).",
);
out.push(` * Keys order: ${KEY.join(",")}. Missing-in-row = \"--\". Generated — do not hand-edit.`);
out.push(
  " * Forward: (Applied,Option)→unique row→DID set. Reverse: full DID set→row; unique when no other row shares payload.",
);
out.push(" */");
out.push("");
out.push(`export const SSM4_CGDW_FP_DID_KEYS = ${JSON.stringify(KEY)} as const;`);
out.push("");
out.push(
  "export type Ssm4CgdwFingerprint = { appliedModel: string; optionCode: string; fp: string };",
);
out.push("");
out.push("export const SSM4_CGDW_FINGERPRINTS: readonly Ssm4CgdwFingerprint[] = [");
for (const r of rows) {
  out.push(
    `  { appliedModel: "${r.appliedModel}", optionCode: "${r.optionCode}", fp: "${r.fp}" },`,
  );
}
out.push("];");
out.push("");
out.push("const byModel = new Map<string, Ssm4CgdwFingerprint[]>();");
out.push("const byFp = new Map<string, Ssm4CgdwFingerprint[]>();");
out.push("for (const p of SSM4_CGDW_FINGERPRINTS) {");
out.push("  const list = byModel.get(p.appliedModel);");
out.push("  if (list) list.push(p);");
out.push("  else byModel.set(p.appliedModel, [p]);");
out.push("  const fl = byFp.get(p.fp);");
out.push("  if (fl) fl.push(p);");
out.push("  else byFp.set(p.fp, [p]);");
out.push("}");
out.push("");
out.push("export function fingerprintFromMeterDids(didHexById: Record<string, string>): string {");
out.push("  return SSM4_CGDW_FP_DID_KEYS.map((k) => {");
out.push(
  '    const raw = (didHexById[k] ?? didHexById[k.toLowerCase()] ?? "").trim().toUpperCase();',
);
out.push('    if (!raw) return "__"; // not read from ECU');
out.push('    if (raw === "--" || raw === "ABSENT") return "--";');
out.push('    const tok = (raw.split(/\\s+/)[0] ?? "").slice(0, 2);');
out.push('    return tok.length === 2 ? tok : "__";');
out.push("  }).join(\"\");");
out.push("}");
out.push("");
out.push("function packMeterMatch(");
out.push("  hits: readonly Ssm4CgdwFingerprint[],");
out.push("  fp: string,");
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
out.push("/** Compare meter dump to catalog fp: __ = unread (skip), -- = absent in row. */");
out.push("function fingerprintCompatible(gotFp: string, wantFp: string): boolean {");
out.push("  if (gotFp.length !== wantFp.length) return false;");
out.push("  for (let i = 0; i < gotFp.length; i += 2) {");
out.push("    const got = gotFp.slice(i, i + 2);");
out.push("    const want = wantFp.slice(i, i + 2);");
out.push('    if (got === "__") continue;');
out.push("    if (got !== want) return false;");
out.push("  }");
out.push(
  "  return SSM4_CGDW_FP_DID_KEYS.some((_, i) => gotFp.slice(i * 2, i * 2 + 2) !== \"__\");",
);
out.push("}");
out.push("");
out.push("function compatibleHits(list: readonly Ssm4CgdwFingerprint[], fp: string): Ssm4CgdwFingerprint[] {");
out.push("  return list.filter((p) => fingerprintCompatible(fp, p.fp));");
out.push("}");
out.push("");
out.push("export function matchSsm4OptionFromMeterDids(");
out.push("  appliedModel: string | null | undefined,");
out.push("  didHexById: Record<string, string>,");
out.push(
  "): { optionCode: string; appliedModel: string | null; unique: boolean; candidates: string[]; fp: string } | null {",
);
out.push("  const fp = fingerprintFromMeterDids(didHexById);");
out.push('  if (!/[0-9A-F]/.test(fp.replace(/[_-]/g, ""))) return null;');
out.push(
  "  const knownSlots = SSM4_CGDW_FP_DID_KEYS.filter((_, i) => fp.slice(i * 2, i * 2 + 2) !== \"__\").length;",
);
out.push('  const app = appliedModel?.trim().toUpperCase() || "";');
out.push("  if (app) {");
out.push("    const list = byModel.get(app) ?? [];");
out.push("    const exact = list.filter((p) => p.fp === fp);");
out.push("    return packMeterMatch(exact.length ? exact : compatibleHits(list, fp), fp);");
out.push("  }");
out.push("  // Global: prefer exact full fingerprint; else compatible with enough known slots.");
out.push("  const exact = byFp.get(fp) ?? [];");
out.push("  if (exact.length) return packMeterMatch(exact, fp);");
out.push("  if (knownSlots < 8) return null; // too few DIDs → do not guess Applied globally");
out.push("  return packMeterMatch(compatibleHits(SSM4_CGDW_FINGERPRINTS, fp), fp);");
out.push("}");
out.push("");

const path = "src/lib/obd/subaru-ssm4-cgdw-fingerprints.ts";
fs.writeFileSync(path, out.join("\n"));
console.log("wrote", path, rows.length, "keys", KEY.length, fs.statSync(path).size);
