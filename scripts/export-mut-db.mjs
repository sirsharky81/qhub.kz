/**
 * Regenerates dictionary/mut-diag-db.json from Mitsubishi MUT-III SE DiagDB.
 * Requires MUT install at C:/MUTSW_SE/MUT3_SE (or set MUT3_SE_ROOT).
 *
 * Usage (from repo root, with ETACS dictionary path):
 *   node scripts/export-mut-db.mjs
 *
 * Output defaults to ../etacs-coding dictionary on FCLOUD layout, or
 * ETACS_DICTIONARY_DIR/mut-diag-db.json when set.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUT_ROOT = process.env.MUT3_SE_ROOT?.trim() || "C:/MUTSW_SE/MUT3_SE";
const envDict = process.env.ETACS_DICTIONARY_DIR?.trim();
const OUT_FILE = envDict
  ? path.join(path.resolve(envDict), "mut-diag-db.json")
  : path.resolve(__dirname, "../../etacs-coding/dictionary/mut-diag-db.json");

const lut = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const v = i ^ 0x55;
  let r = 0;
  for (let b = 0; b < 8; b++) r = (r << 1) | ((v >>> b) & 1);
  lut[i] = r;
}

function decodeExdf(filePath) {
  const buf = fs.readFileSync(filePath);
  for (let i = 0; i < buf.length; i++) buf[i] = lut[buf[i]];
  return buf.toString("utf8").replace(/\x00/g, "");
}

function unesc(s = "") {
  return s
    .replace(/&#xA;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

if (!fs.existsSync(path.join(MUT_ROOT, "DiagDB/DiagSystem.exdf"))) {
  console.error(`MUT DiagDB not found at ${MUT_ROOT}`);
  process.exit(1);
}

console.log("1. Loading DiagLangH.exdf...");
const langH = decodeExdf(path.join(MUT_ROOT, "DiagDB/DiagLangH.exdf"));

function parseLangMapFast(tag, attr) {
  const map = new Map();
  const closeTag = `</${tag}>`;
  const attrRe = new RegExp(`<${tag} ${attr}="([^"]+)">`);
  for (const chunk of langH.split(closeTag)) {
    const id = chunk.match(attrRe)?.[1];
    if (!id) continue;
    const en = unesc(chunk.match(/<E>([\s\S]*?)<\/E>/)?.[1] || "");
    const ru = unesc(chunk.match(/<R>([\s\S]*?)<\/R>/)?.[1] || en);
    map.set(id, { en, ru: ru || en });
  }
  return map;
}

const sysNames = parseLangMapFast("system_name", "sid");
const funcNames = parseLangMapFast("function_name", "fid");
const dtcNames = parseLangMapFast("dtc_name", "did");
const groupNames = parseLangMapFast("group_name", "gid");
const itemNames = parseLangMapFast("item_name", "iid");
const unitNames = parseLangMapFast("unit_name", "uid");
const enumNames = parseLangMapFast("enum_name", "eid");

console.log("2. Loading DiagSystem.exdf...");
const dsys = decodeExdf(path.join(MUT_ROOT, "DiagDB/DiagSystem.exdf"));
const diagCommon = decodeExdf(path.join(MUT_ROOT, "DiagDB/DiagCommon.exdf"));

const ecuNames = new Map();
for (const m of dsys.matchAll(/<ecu_list eid="(\d+)"><ecu_name>([^<]+)<\/ecu_name><\/ecu_list>/g)) {
  ecuNames.set(m[1], m[2]);
}
const sysKeyToYid = new Map();
for (const m of dsys.matchAll(/<syskey sid="(\d+)"><system yid="([^"]+)">/g)) {
  sysKeyToYid.set(m[1], m[2]);
}
const mutClasses = new Map();
for (const chunk of dsys.split("</mut_class_list>")) {
  const mid = chunk.match(/<mut_class_list mid="(\d+)">/)?.[1];
  if (mid) mutClasses.set(mid, chunk);
}

const TARGET_VEHICLES = [
  {
    vkey: "1108740010",
    sampleVin: "MMEMCY1XXNH003447",
    modelCodes: ["KS5W", "KR1W", "KS1W", "KR3W", "KS3W"],
    nameEn: "PAJERO SPORT / MONTERO SPORT III (2016–2025)",
    nameRu: "Mitsubishi Pajero Sport III (6B31 3.0 V6 / 4N15 2.4D)",
  },
  {
    vkey: "1107790064",
    sampleVin: "LL66HAB02NB025530",
    modelCodes: ["GF7W", "GF2W", "GF3W", "GF4W", "GF6W", "GF8W", "GG2W", "GG3W"],
    nameEn: "OUTLANDER III (2013–2024)",
    nameRu: "Mitsubishi Outlander III (4J11 2.0 / 4J12 2.4 / 6B31 3.0)",
  },
];

const ecusByVehicle = {};
const allTargetExdfs = new Map();

for (const veh of TARGET_VEHICLES) {
  const idx = dsys.indexOf(`<vkey_list vid="${veh.vkey}">`);
  const vblock = idx >= 0 ? dsys.slice(idx, dsys.indexOf("</vkey_list>", idx)) : "";
  const ecus = [];

  for (const sm of vblock.matchAll(
    /<syskey_list sid="(\d+)"><mut_class>(\d+)<\/mut_class><app_flag>(\d+)<\/app_flag><\/syskey_list>/g,
  )) {
    const [, sid, mid] = sm;
    const yid = sysKeyToYid.get(sid) || "";
    const sname = sysNames.get(yid) || { en: yid, ru: yid };
    const mc = mutClasses.get(mid) || "";
    const proto = mc.match(/<protocol_id>([^<]+)<\/protocol_id>/)?.[1] || "";
    const tx = mc.match(/<tx_can_id>([^<]+)<\/tx_can_id>/)?.[1] || "";
    const rx = mc.match(/<rx_can_id>([^<]+)<\/rx_can_id>/)?.[1] || "";
    const dtcMaster = (mc.match(/<dtc_master>([^<]+)<\/dtc_master>/)?.[1] || "").padStart(2, "0");

    const ecuVariants = [...mc.matchAll(/<skey_list><ecu_id>(\d+)<\/ecu_id>([\s\S]*?)<\/skey_list>/g)].map((x) => {
      const ename = ecuNames.get(x[1]) || "";
      const exdfFile = ename ? `${ename}.exdf` : "";
      const diagVersions = [...x[2].matchAll(/<diag_version did="([^"]+)"><skey>(\d+)<\/skey><\/diag_version>/g)].map(
        (d) => ({
          diagVersionHex: `0x${d[1]}`,
          skey: d[2],
        }),
      );
      if (exdfFile && exdfFile !== "OPLESS.exdf") {
        if (!allTargetExdfs.has(exdfFile)) {
          allTargetExdfs.set(exdfFile, {
            file: exdfFile,
            dtcMid: dtcMaster,
            role: `${sname.en} (${sname.ru})`,
            skeys: new Set(),
          });
        }
        const entry = allTargetExdfs.get(exdfFile);
        const nonFallback = diagVersions.filter((dv) => dv.diagVersionHex !== "0xFFFF");
        if (nonFallback.length > 0) {
          entry.skeys.add(nonFallback[nonFallback.length - 1].skey);
        }
      }
      return { exdfFile, diagVersions };
    });

    ecus.push({
      sysKey: Number(sid),
      systemIdHex: yid,
      nameEn: sname.en,
      nameRu: sname.ru,
      protocolId: proto,
      txCanId: tx ? `0x${tx}` : null,
      rxCanId: rx ? `0x${rx}` : null,
      dtcMasterId: dtcMaster,
      variants: ecuVariants,
    });
  }

  ecusByVehicle[veh.vkey] = { ...veh, ecuCount: ecus.length, ecus };
}

const dtcByMaster = {};
for (const chunk of diagCommon.split("</dtc_master>")) {
  const mid = chunk.match(/<dtc_master mid="([^"]+)">/)?.[1];
  if (!mid) continue;
  const map = {};
  for (const dm of chunk.matchAll(/<dtc did="([^"]+)">\s*<dtc_id>(\d+)<\/dtc_id>/g)) {
    const code = dm[1];
    const did = dm[2];
    const tr = dtcNames.get(did) || { en: "", ru: "" };
    map[code] = { en: tr.en, ru: tr.ru || tr.en };
  }
  dtcByMaster[mid] = map;
}

function parseEcuExdf(entry) {
  const fullPath = path.join(MUT_ROOT, "DiagDB/Ecu", entry.file);
  if (!fs.existsSync(fullPath)) return null;
  const xml = decodeExdf(fullPath);

  const availableSkeys = [...xml.matchAll(/<skey sid="(\d+)">/g)].map((m) => m[1]);
  const prioritySkeys = ["220015009", "220015014", "226626201", "226626204", "10022701"];
  const targetSkeys = new Set();
  for (const ps of prioritySkeys) {
    if (availableSkeys.includes(ps)) targetSkeys.add(ps);
  }
  const vehicleSkeys = [...entry.skeys].filter((s) => availableSkeys.includes(s));
  for (const vs of vehicleSkeys) targetSkeys.add(vs);
  if (targetSkeys.size === 0 && availableSkeys.length > 0) {
    targetSkeys.add(availableSkeys[availableSkeys.length - 1]);
  }

  const profiles = {};
  for (const sid of targetSkeys) {
    const sIdx = xml.indexOf(`<skey sid="${sid}">`);
    if (sIdx < 0) continue;
    const sblock = xml.slice(sIdx, xml.indexOf("</skey>", sIdx));

    const quals = new Map();
    for (const qChunk of sblock.split("</qual_id>")) {
      const qid = qChunk.match(/<qual_id qid="(\d+)">/)?.[1];
      if (!qid) continue;
      const udsSid = Number(qChunk.match(/<sid>(-?\d+)<\/sid>/)?.[1] ?? -1);
      const lid = Number(qChunk.match(/<lid>(-?\d+)<\/lid>/)?.[1] ?? -1);
      const reqMsg = qChunk.match(/<req_msg>([^<]*)<\/req_msg>/)?.[1] || "";
      const unitId = qChunk.match(/<unit_id>(\d+)<\/unit_id>/)?.[1] || "0";
      const bytePos = Number(qChunk.match(/<byte_pos>(-?\d+)<\/byte_pos>/)?.[1] ?? -1);
      const byteLen = Number(qChunk.match(/<byte_len>(-?\d+)<\/byte_len>/)?.[1] ?? -1);
      const byteOrder = Number(qChunk.match(/<byte_order>(-?\d+)<\/byte_order>/)?.[1] ?? 2);
      const bitPos = Number(qChunk.match(/<bit_pos>(-?\d+)<\/bit_pos>/)?.[1] ?? -1);
      const bitLen = Number(qChunk.match(/<bit_len>(-?\d+)<\/bit_len>/)?.[1] ?? -1);
      const dataType = Number(qChunk.match(/<data_type>(-?\d+)<\/data_type>/)?.[1] ?? 0);
      const convType = Number(qChunk.match(/<conv_type>(-?\d+)<\/conv_type>/)?.[1] ?? 0);
      const scaleMatch = qChunk.match(/<scale_type>([\s\S]*?)<\/scale_type>/);
      const factor = scaleMatch ? Number(scaleMatch[1].match(/<factor>([^<]+)<\/factor>/)?.[1] ?? 1) : 1;
      const offset = scaleMatch ? Number(scaleMatch[1].match(/<offset>([^<]+)<\/offset>/)?.[1] ?? 0) : 0;
      const format = scaleMatch ? Number(scaleMatch[1].match(/<format>([^<]+)<\/format>/)?.[1] ?? 0) : 0;
      const enums = [...qChunk.matchAll(/<enum_type>([\s\S]*?)<\/enum_type>/g)].map((em) => {
        const val = Number(em[1].match(/<enum_value>(-?\d+)<\/enum_value>/)?.[1] ?? 0);
        const str = unesc(em[1].match(/<enum_string>([\s\S]*?)<\/enum_string>/)?.[1] || "");
        const eid = em[1].match(/<enum_id>(\d+)<\/enum_id>/)?.[1] || "";
        const tr = enumNames.get(eid) || { en: str, ru: str };
        return { value: val, en: tr.en || str, ru: tr.ru || tr.en || str };
      });
      const uTr = unitNames.get(unitId) || { en: "", ru: "" };
      quals.set(qid, {
        udsServiceId: udsSid > 0 ? `0x${udsSid.toString(16).toUpperCase().padStart(2, "0")}` : null,
        localId: lid >= 0 ? `0x${lid.toString(16).toUpperCase().padStart(2, "0")}` : null,
        reqMsg,
        unitEn: uTr.en,
        unitRu: uTr.ru || uTr.en,
        bytePos,
        byteLen,
        byteOrder,
        bitPos,
        bitLen,
        signed: dataType === 1,
        convType,
        factor,
        offset,
        decimals: format,
        enums: enums.length > 0 ? enums : undefined,
      });
    }

    const functions = [];
    for (const fChunk of sblock.split("</function>")) {
      const fid = fChunk.match(/<function fid="(\d+)">/)?.[1];
      if (!fid) continue;
      const fTr =
        funcNames.get(fid) || funcNames.get(String(Number(fid) % 100)) || { en: `Function ${fid}`, ru: `Функция ${fid}` };
      functions.push({ fid: Number(fid), nameEn: fTr.en, nameRu: fTr.ru });
    }

    const dataList = [];
    const f4 = sblock.match(/<function fid="4">([\s\S]*?)<\/function>/)?.[1] || "";
    for (const im of f4.matchAll(/<item_list>([\s\S]*?)<\/item_list>/g)) {
      const no = Number(im[1].match(/<no>(\d+)<\/no>/)?.[1] ?? 0);
      const iid = im[1].match(/<item_lang_id>(\d+)<\/item_lang_id>/)?.[1] || "";
      const qid = im[1].match(/<qual_id>(\d+)<\/qual_id>/)?.[1] || "";
      const tr = itemNames.get(iid) || { en: iid, ru: iid };
      const q = quals.get(qid);
      if (!q) continue;
      dataList.push({ itemNo: no, nameEn: tr.en, nameRu: tr.ru, ...q });
    }

    const actuatorTests = [];
    const f48 = sblock.match(/<function fid="48">([\s\S]*?)<\/function>/)?.[1] || "";
    for (const im of f48.matchAll(/<item_list>([\s\S]*?)<\/item_list>/g)) {
      const no = Number(im[1].match(/<no>(\d+)<\/no>/)?.[1] ?? 0);
      const gid = im[1].match(/<group_id>(\d+)<\/group_id>/)?.[1] || "";
      const iid = im[1].match(/<item_lang_id>(\d+)<\/item_lang_id>/)?.[1] || "";
      const qid = im[1].match(/<qual_id>(\d+)<\/qual_id>/)?.[1] || "";
      const tr =
        (iid && itemNames.get(iid)) || (gid && groupNames.get(gid)) || { en: gid || iid, ru: gid || iid };
      const q = quals.get(qid) || {};
      actuatorTests.push({
        itemNo: no,
        groupId: gid || undefined,
        nameEn: tr.en,
        nameRu: tr.ru,
        udsServiceId: q.udsServiceId || "0x30",
        localId: q.localId || null,
        reqMsg: q.reqMsg || "",
      });
    }

    const specialFunctions = [];
    for (const fm of sblock.matchAll(/<function fid="(\d*08)">([\s\S]*?)<\/function>/g)) {
      const fid = fm[1];
      if (fid === "2808") continue;
      const items = [...fm[2].matchAll(/<item_list>([\s\S]*?)<\/item_list>/g)].map((im) => {
        const no = Number(im[1].match(/<no>(\d+)<\/no>/)?.[1] ?? 0);
        const iid = im[1].match(/<item_lang_id>(\d+)<\/item_lang_id>/)?.[1] || "";
        const gid = im[1].match(/<group_id>(\d+)<\/group_id>/)?.[1] || "";
        const qid = im[1].match(/<qual_id>(\d+)<\/qual_id>/)?.[1] || "";
        const tr =
          (iid && itemNames.get(iid)) || (gid && groupNames.get(gid)) || { en: iid || gid, ru: iid || gid };
        const q = quals.get(qid) || {};
        return {
          itemNo: no,
          nameEn: tr.en,
          nameRu: tr.ru,
          udsServiceId: q.udsServiceId,
          localId: q.localId,
          reqMsg: q.reqMsg || "",
        };
      });
      specialFunctions.push({ fid: Number(fid), items });
    }

    profiles[sid] = {
      skey: sid,
      functions,
      dataListCount: dataList.length,
      dataList,
      actuatorTestCount: actuatorTests.length,
      actuatorTests,
      specialFunctions,
    };
  }

  return {
    exdfFile: entry.file,
    role: entry.role,
    dtcMasterId: entry.dtcMid,
    dtcCount: Object.keys(dtcByMaster[entry.dtcMid] || {}).length,
    availableSkeys,
    profiles,
  };
}

console.log(`4. Parsing ${allTargetExdfs.size} ECU .exdf files...`);
const ecuDefinitions = {};
const exportedDtcMasters = {};
for (const entry of allTargetExdfs.values()) {
  const parsed = parseEcuExdf(entry);
  if (parsed) {
    ecuDefinitions[entry.file] = parsed;
    if (dtcByMaster[entry.dtcMid]) exportedDtcMasters[entry.dtcMid] = dtcByMaster[entry.dtcMid];
    const pSummary = Object.values(parsed.profiles)
      .map((p) => `${p.skey}(DL:${p.dataListCount},Act:${p.actuatorTestCount},Spec:${p.specialFunctions.length})`)
      .join(", ");
    console.log(`  - ${entry.file}: ${pSummary}`);
  }
}

const out = {
  source: "Mitsubishi MUT-III SE",
  generatedAt: new Date().toISOString(),
  encryptionNote: "exdf: bitReverse8(b ^ 0x55)",
  ecusByVehicle,
  ecuDefinitions,
  dtcMasters: exportedDtcMasters,
};

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n");
console.log(`Saved ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / (1024 * 1024)).toFixed(2)} MB).`);