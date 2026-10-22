import crcConfig from "@/lib/etacs-coding/data/crc.json";
import {
  loadBlockDictionaryById,
  loadDedicatedDictionaries,
  loadDictionaryIndex,
  type BlockDictionary,
} from "@/lib/etacs-coding/datastore";
import type {
  EtacsApplyResult,
  EtacsFileView,
  EtacsProfileSummary,
  EtacsSaveResult,
} from "@/lib/etacs-coding/types";
import { applyAlgorithm } from "@/lib/etacs-coding/engine/crc.js";
import {
  applyOption,
  codingMatchesBaseline,
  decodeParameter,
  extractBitfield,
} from "@/lib/etacs-coding/engine/dictionary.js";
import {
  bytesToHex,
  hexToBytes,
  parseKon,
  writeKon,
} from "@/lib/etacs-coding/engine/kon.js";

interface ParsedKon {
  bom: boolean;
  vin: string;
  date: string;
  ecuId: string;
  coding: Uint8Array;
  crc: string;
  copiesMatch: boolean;
}

function looksLikeCufBytes(coding: Uint8Array): boolean {
  if (!coding || coding.length === 0) return false;
  let cufLike = 0;
  for (let i = 0; i < coding.length; i++) {
    const b = coding[i];
    if (
      b === 0xff ||
      b === 0x00 ||
      b === 0x80 ||
      b === 0x40 ||
      b === 0x20 ||
      b === 0x10 ||
      b === 0x08 ||
      b === 0x04 ||
      b === 0x02 ||
      (b & 0x0f) <= 0x0f
    ) {
      if (
        b === 0xff ||
        b === 0x80 ||
        b === 0x40 ||
        b === 0x20 ||
        (b & 0xf0) === 0xf0 ||
        (b & 0x0f) === 0x0f
      ) {
        cufLike++;
      }
    }
  }
  return cufLike >= Math.ceil(coding.length * 0.45);
}

function detectFileKindFromName(fileName: string): "kon" | "cuf" | null {
  const lower = String(fileName || "").toLowerCase();
  if (/\.cuf(?=$|[^a-z])/i.test(lower)) return "cuf";
  if (/\.kon(?=$|[^a-z])/i.test(lower)) return "kon";
  return null;
}

function scoreCatalogProfile(
  profile: BlockDictionary,
  context: {
    ecuId?: string;
    vin?: string;
    coding?: Uint8Array;
    fileName?: string;
    codingBytes?: number;
  },
): number {
  let score = 0;
  const detectedKind = detectFileKindFromName(context.fileName || "");
  const isCufExt = detectedKind === "cuf";
  const isKonExt = detectedKind === "kon";
  const coding = context.coding;

  if (isCufExt) {
    score += profile.kind === "cuf" ? 600 : -400;
  } else if (isKonExt) {
    score += profile.kind !== "cuf" ? 600 : -400;
  } else if (coding) {
    const cufPattern = looksLikeCufBytes(coding);
    if (cufPattern && profile.kind === "cuf") score += 250;
    if (!cufPattern && profile.kind !== "cuf") score += 250;
  }

  const upperEcu = String(context.ecuId || "").toUpperCase();
  if (upperEcu && (profile.partNumbers ?? []).includes(upperEcu)) {
    score += 800;
  }
  const ecuPrefix = upperEcu.slice(0, 4);
  if (ecuPrefix && (profile.partPrefixes ?? []).includes(ecuPrefix)) {
    score += 350;
  }

  const upperVin = String(context.vin || "").toUpperCase();
  if (upperVin.length >= 8) {
    const vinBody = upperVin.slice(3, 9);
    for (const cp of profile.chassisPrefixes ?? []) {
      if (cp && cp.length >= 2 && vinBody.includes(cp.toUpperCase())) {
        score += 220;
        break;
      }
    }
  }

  if (coding && coding.length > 0 && profile.parameters?.length) {
    let validCount = 0;
    let nonZeroValid = 0;
    let invalidNonDefault = 0;
    for (const param of profile.parameters) {
      const raw = extractBitfield(coding, param.bitfield);
      if (raw === null) continue;
      const matched = (param.options ?? []).some((opt) => opt.value === raw);
      if (matched) {
        validCount++;
        if (raw !== 0) nonZeroValid++;
      } else {
        const isDefaultUnset =
          profile.kind === "cuf" && (raw === 0xff || raw === 0x0f || raw === 0x00);
        if (!isDefaultUnset) invalidNonDefault++;
      }
    }
    const validRatio = validCount / profile.parameters.length;
    score += Math.round(validRatio * 400);
    score += nonZeroValid * 4;
    score -= invalidNonDefault * 12;
  }

  score += Math.min(profile.parameterCount || profile.parameters?.length || 0, 300) * 0.25;
  return score;
}

function candidateProfilesFor(
  codingBytes: number,
  context: { ecuId?: string; vin?: string; coding?: Uint8Array; fileName?: string },
) {
  const index = loadDictionaryIndex();
  const exactMeta = index.blocks.filter((b) => b.codingBytes === codingBytes);
  const poolMeta =
    exactMeta.length > 0
      ? exactMeta
      : index.blocks.filter((b) => b.codingBytes > 0 && b.codingBytes <= codingBytes);
  return poolMeta
    .map((meta) => {
      const profile = loadBlockDictionaryById(meta.id);
      if (!profile) return null;
      return {
        profile,
        score: scoreCatalogProfile(profile, { ...context, codingBytes }),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score) as Array<{ profile: BlockDictionary; score: number }>;
}

function resolveDictionary(context: {
  ecuId?: string;
  vin?: string;
  codingHex?: string;
  fileName?: string;
  profileId?: string;
}): { dictionary: BlockDictionary | null; availableProfiles: EtacsProfileSummary[] } {
  const cleanHex = String(context.codingHex || "").replace(/\s+/g, "").toUpperCase();
  const coding =
    cleanHex.length >= 2 && cleanHex.length % 2 === 0 ? hexToBytes(cleanHex) : new Uint8Array(0);
  const codingBytes = coding.length;
  const dedicatedList = loadDedicatedDictionaries();
  const { ecuId = "", vin = "", fileName = "", profileId = "" } = context;

  const ranked =
    codingBytes > 0 ? candidateProfilesFor(codingBytes, { ecuId, vin, coding, fileName }) : [];

  const exactDedicated = dedicatedList.filter(
    (d) => d.ecuId === ecuId && (!codingBytes || d.codingBytes === codingBytes),
  );

  const availableProfiles: EtacsProfileSummary[] = [
    ...exactDedicated.map((d) => ({
      id: d.id,
      ecuName: d.ecuId!,
      skey: d.skey || "",
      kind: d.id.endsWith("-cuf") ? "cuf" : "kon",
      codingBytes: d.codingBytes || 0,
      parameterCount: d.parameters.length,
      model: d.model || "",
      unit: d.unit || "",
      label: `${d.id}${d.skey ? ` [skey ${d.skey}]` : ""} (${d.parameters.length} пар.) · ${d.model}`,
    })),
    ...ranked.map(({ profile }) => ({
      id: profile.id,
      ecuName: profile.ecuName || profile.ecuId || "",
      skey: profile.skey || "",
      kind: profile.kind || "kon",
      codingBytes: profile.codingBytes || 0,
      parameterCount: profile.parameterCount || profile.parameters.length,
      model: profile.model || "",
      unit: profile.unit || "",
      label: `${profile.ecuName} [skey ${profile.skey}] (${profile.parameterCount || profile.parameters.length} пар.) · ${profile.model}`,
    })),
  ];

  if (profileId) {
    const dedicatedById = dedicatedList.find((d) => d.id === profileId);
    if (dedicatedById && (!codingBytes || dedicatedById.codingBytes === codingBytes)) {
      return { dictionary: dedicatedById, availableProfiles };
    }
    const blockById = loadBlockDictionaryById(profileId);
    if (blockById) {
      return {
        dictionary: {
          ...blockById,
          ecuId: ecuId || blockById.partNumbers?.[0] || blockById.ecuName,
          masksComplete: true,
          status: "ready",
        },
        availableProfiles,
      };
    }
  }

  if (exactDedicated.length > 0) {
    return { dictionary: exactDedicated[0]!, availableProfiles };
  }

  if (ranked.length > 0) {
    const best = ranked[0]!.profile;
    return {
      dictionary: {
        ...best,
        ecuId: ecuId || best.partNumbers?.[0] || best.ecuName,
        masksComplete: true,
        status: "ready",
      },
      availableProfiles,
    };
  }

  return { dictionary: null, availableProfiles: [] };
}

function dictionaryFor(ecuId: string, codingHex: string, profileId = "") {
  return resolveDictionary({ ecuId, codingHex, profileId }).dictionary;
}

function crcInfo() {
  return crcConfig as {
    verified: boolean;
    algorithm: Parameters<typeof applyAlgorithm>[0];
    note?: string;
  };
}

function parameterByteIndices(parameter: {
  bitfield?: { byteIndex: number; byteLen?: number };
  mask?: string | null;
}): number[] {
  if (parameter.bitfield && typeof parameter.bitfield.byteIndex === "number") {
    const start = parameter.bitfield.byteIndex;
    const len = parameter.bitfield.byteLen ?? 1;
    const out: number[] = [];
    for (let i = 0; i < len; i++) out.push(start + i);
    return out;
  }
  if (parameter.mask) {
    const mask = hexToBytes(parameter.mask);
    const out: number[] = [];
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] !== 0) out.push(i);
    }
    return out;
  }
  return [];
}

export function describeParsed(
  parsed: ParsedKon,
  options: { fileName?: string; profileId?: string } = {},
): EtacsFileView {
  const codingHex = bytesToHex(parsed.coding);
  const { dictionary, availableProfiles } = resolveDictionary({
    ecuId: parsed.ecuId,
    vin: parsed.vin,
    codingHex,
    fileName: options.fileName || "",
    profileId: options.profileId || "",
  });
  const readOnly = Boolean(dictionary?.readOnly);
  const info = crcInfo();
  const computed = info.verified ? applyAlgorithm(info.algorithm, parsed.coding) : null;
  const rows = (dictionary?.parameters ?? []).map((parameter) => {
    const decoded = dictionary
      ? decodeParameter(parameter, parsed.coding)
      : { label: null, editable: false };
    const onBaseline = dictionary ? codingMatchesBaseline(dictionary, parsed.coding) : false;
    return {
      id: parameter.id,
      name: parameter.name,
      nameRu: parameter.nameRu || "",
      label: decoded.label ?? (onBaseline ? parameter.baselineLabel : null) ?? null,
      baselineLabel: parameter.baselineLabel || "",
      editable: !readOnly && decoded.editable,
      options: (parameter.options ?? []).map((option) => option.label),
      optionsRu: Object.fromEntries(
        (parameter.options ?? [])
          .filter((option) => option.labelRu && option.labelRu !== option.label)
          .map((option) => [option.label, option.labelRu!]),
      ),
      outsideMut: Boolean(parameter.outsideMut),
      detail: parameter.detail || parameter.note || "",
      byteIndices: parameterByteIndices(parameter),
    };
  });

  return {
    vin: parsed.vin,
    date: parsed.date,
    ecuId: parsed.ecuId,
    profileId: dictionary?.id || "",
    ecuName: dictionary?.ecuName || "",
    availableProfiles,
    model: dictionary?.model || "",
    unit: dictionary?.unit || "",
    status: dictionary?.status || (dictionary ? "ready" : "unknown"),
    readOnly,
    statusNote: dictionary?.statusNote || "",
    crc: parsed.crc,
    codingHex,
    codingBytes: parsed.coding.length,
    copiesMatch: parsed.copiesMatch,
    bom: parsed.bom,
    crcVerified: computed !== null && computed === parsed.crc,
    crcComputed: computed,
    crcNote: info.note,
    hasDictionary: Boolean(dictionary),
    masksComplete: Boolean(dictionary?.masksComplete),
    matchesBaseline: dictionary ? codingMatchesBaseline(dictionary, parsed.coding) : false,
    rows,
  };
}

export function parseEtacsBuffer(
  buffer: Buffer,
  options: { fileName?: string; profileId?: string } = {},
): EtacsFileView {
  const parsed = parseKon(buffer);
  return describeParsed(parsed, options);
}

export function decodeEtacsPayload(payload: {
  vin: string;
  date: string;
  ecuId: string;
  codingHex: string;
  crc?: string;
  bom?: boolean;
  fileName?: string;
  profileId?: string;
}): EtacsFileView {
  const coding = hexToBytes(payload.codingHex);
  const parsed: ParsedKon = {
    vin: payload.vin,
    date: payload.date,
    ecuId: payload.ecuId,
    coding,
    crc: payload.crc ?? "0000",
    copiesMatch: true,
    bom: Boolean(payload.bom),
  };
  return describeParsed(parsed, {
    fileName: payload.fileName || "",
    profileId: payload.profileId || "",
  });
}

export function applyEtacsOption(payload: {
  ecuId: string;
  profileId?: string;
  id: number;
  label: string;
  codingHex: string;
}): EtacsApplyResult {
  const dictionary = dictionaryFor(payload.ecuId, payload.codingHex, payload.profileId || "");
  if (!dictionary) {
    throw new Error("Нет справочника для этого ECU");
  }
  if (dictionary.readOnly) {
    throw new Error(
      dictionary.statusNote || "Блок находится в разработке (только просмотр и CRC)",
    );
  }
  const parameter = dictionary.parameters.find((item) => item.id === payload.id);
  if (!parameter) {
    throw new Error("Параметр не найден");
  }
  const next = applyOption(hexToBytes(payload.codingHex), parameter, payload.label);
  const info = crcInfo();
  const computed = info.verified ? applyAlgorithm(info.algorithm, next) : null;
  return {
    codingHex: bytesToHex(next),
    crc: computed,
    crcVerified: computed !== null,
  };
}

export function saveEtacsPayload(payload: {
  force?: boolean;
  vin: string;
  date: string;
  ecuId: string;
  codingHex: string;
  crc?: string;
  bom?: boolean;
  fileName?: string;
}): EtacsSaveResult {
  const info = crcInfo();
  const coding = hexToBytes(payload.codingHex);
  const computed = info.verified ? applyAlgorithm(info.algorithm, coding) : null;
  const crcVerified = computed !== null;
  if (!crcVerified && !payload.force) {
    const err = new Error(
      "CRC не подтверждена. Файл можно сохранить, но MUT может написать «Данные в файле повреждены», пока его там не пересохранят.",
    ) as Error & { status?: number; crcVerified?: boolean };
    err.status = 409;
    err.crcVerified = false;
    throw err;
  }
  const crc = crcVerified ? computed! : String(payload.crc || "0000").toUpperCase();
  const bytes = writeKon(
    {
      bom: Boolean(payload.bom),
      vin: payload.vin,
      date: payload.date,
      ecuId: payload.ecuId,
      coding,
      crc,
    },
    {},
  );
  const detectedKind = detectFileKindFromName(payload.fileName || "");
  const ext = detectedKind === "cuf" ? ".cuf" : ".kon";
  const rawName = String(payload.fileName || "").trim();
  const stem = rawName
    ? rawName
        .replace(/\.(kon|cuf).*$/i, "")
        .replace(/[^\w.\-()+\u0400-\u04FF ]+/g, "_")
        .replace(/\.+$/g, "")
    : "";
  const fileName = `${stem || `${payload.ecuId}_${payload.vin}`}${ext}`;
  return {
    crc,
    crcVerified,
    bytes: Buffer.from(bytes).toString("base64"),
    fileName,
  };
}
