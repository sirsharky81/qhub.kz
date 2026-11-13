import {
  SSM4_YYW_FP_DID_KEYS,
  summarizeEyesightCatalogComparison,
  type Ssm4EyesightCatalogSummary,
  type SubaruEyesightVariantMatch,
} from "./subaru-ssm4-catalog";

export const SUBARU_EYESIGHT_BACKUP_FORMAT = "qhub-subaru-eyesight-backup-v1" as const;

export const SUBARU_EYESIGHT_WRITABLE_DIDS = [
  ...SSM4_YYW_FP_DID_KEYS,
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
] as const;

const WRITABLE_EYESIGHT_SET = new Set<string>(SUBARU_EYESIGHT_WRITABLE_DIDS);
const YYW_35XX_SET = new Set<string>(SSM4_YYW_FP_DID_KEYS);

export interface SubaruEyesightDidEntry {
  did: string;
  label: string;
  hex: string;
  decoded: string;
}

export interface SubaruEyesightWriteEntry {
  did: string;
  byteHex: string;
}

export interface SubaruEyesightBackupFile {
  format: typeof SUBARU_EYESIGHT_BACKUP_FORMAT;
  savedAt: string;
  vin: string | null;
  txHex: string;
  rxHex: string;
  appliedModel: string;
  inferredOptionCode: string;
  stickerOptionCode: string | null;
  destinationHint: "USA" | "CANADA" | "UNKNOWN";
  /** All DIDs read during ADA-032 / Confirm on Parameter (3501..3510 + passport). */
  dids: SubaruEyesightDidEntry[];
  /** Present 1-byte variant DIDs (3501..3510 or 3091..309D) for 1:1 restore. */
  restore35xxDids: SubaruEyesightWriteEntry[];
  /** 3501..3510 DIDs that returned NRC / no response (`--`). */
  absent35xxDids: string[];
  /** Recorded differences between original EyeSight dump and every Y-Yw row for Applied Model. */
  catalogComparison: Ssm4EyesightCatalogSummary;
}

export interface SubaruEyesightBackupLiveDiffItem {
  did: string;
  backupHex: string;
  liveHex: string;
}

export interface SubaruEyesightBackupLiveDiff {
  changed: SubaruEyesightBackupLiveDiffItem[];
  unchangedCount: number;
  totalBackupWritable: number;
}

export function isWritableEyesightVariantDid(did: string): boolean {
  return WRITABLE_EYESIGHT_SET.has(did.trim().toUpperCase());
}

export function extractEyesightDidHexMap(
  dids: readonly { did: string; hex: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of dids) {
    out[d.did.trim().toUpperCase()] = d.hex.trim().toUpperCase();
  }
  return out;
}

export function buildSubaruEyesightBackup(
  read: {
    capturedAt?: string;
    vin: string | null;
    txHex: string;
    rxHex: string;
    dids: SubaruEyesightDidEntry[];
    match: SubaruEyesightVariantMatch;
  },
  hintAppliedModel?: string | null,
  stickerOptionCode?: string | null,
): SubaruEyesightBackupFile {
  const didMap = extractEyesightDidHexMap(read.dids);
  const cleanHintApp =
    hintAppliedModel
      ?.trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 7) || null;
  const appliedModel = read.match.appliedModel || cleanHintApp || "BTAEYR8";
  const inferredOptionCode = read.match.optionCode || "UNKNOWN";
  const cleanSticker =
    stickerOptionCode
      ?.trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4) || null;

  const restore35xxDids: SubaruEyesightWriteEntry[] = [];
  const absentSet = new Set<string>();
  const seen = new Set<string>();

  for (const entry of read.dids) {
    const did = entry.did.trim().toUpperCase();
    if (!isWritableEyesightVariantDid(did)) continue;
    const rawHex = entry.hex.trim().toUpperCase();
    if (!rawHex || rawHex === "--" || rawHex === "ABSENT") {
      if (YYW_35XX_SET.has(did)) absentSet.add(did);
      continue;
    }
    const firstByte = (rawHex.split(/\s+/)[0] ?? "").slice(0, 2);
    if (/^[0-9A-F]{2}$/.test(firstByte) && !seen.has(did)) {
      seen.add(did);
      restore35xxDids.push({ did, byteHex: firstByte });
    }
  }

  for (const did of YYW_35XX_SET) {
    if (!seen.has(did) && !absentSet.has(did)) {
      const v = didMap[did];
      if (!v || v === "--") absentSet.add(did);
    }
  }

  restore35xxDids.sort((a, b) => a.did.localeCompare(b.did));
  const absent35xxDids = [...absentSet].sort((a, b) => a.localeCompare(b));

  const catalogComparison = summarizeEyesightCatalogComparison(appliedModel, didMap);

  return {
    format: SUBARU_EYESIGHT_BACKUP_FORMAT,
    savedAt: read.capturedAt || new Date().toISOString(),
    vin: read.vin,
    txHex: read.txHex,
    rxHex: read.rxHex,
    appliedModel,
    inferredOptionCode,
    stickerOptionCode: cleanSticker && cleanSticker.length === 4 ? cleanSticker : null,
    destinationHint: read.match.destinationHint,
    dids: read.dids.map((d) => ({ ...d })),
    restore35xxDids,
    absent35xxDids,
    catalogComparison,
  };
}

export function serializeSubaruEyesightBackup(backup: SubaruEyesightBackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export function suggestSubaruEyesightBackupFilename(backup: SubaruEyesightBackupFile): string {
  const vinTail = backup.vin && backup.vin.length >= 6 ? backup.vin.slice(-8) : "NOVIN";
  const opt = backup.stickerOptionCode || backup.inferredOptionCode || "ORIG";
  const date = (backup.savedAt || new Date().toISOString()).slice(0, 10);
  return `subaru-eyesight-${backup.appliedModel}-${opt}-${vinTail}-${date}.json`;
}

export function parseSubaruEyesightBackupJson(
  rawText: string,
): { ok: true; backup: SubaruEyesightBackupFile } | { ok: false; errorRu: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, errorRu: "Файл не является корректным JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, errorRu: "Пустой или некорректный объект бэкапа EyeSight." };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.format !== SUBARU_EYESIGHT_BACKUP_FORMAT) {
    return {
      ok: false,
      errorRu: `Неподдерживаемый формат файла (ожидается ${SUBARU_EYESIGHT_BACKUP_FORMAT}).`,
    };
  }
  if (!Array.isArray(obj.restore35xxDids) || obj.restore35xxDids.length === 0) {
    return {
      ok: false,
      errorRu: "В бэкапе EyeSight нет списка вариантных DID (restore35xxDids).",
    };
  }

  const restore35xxDids: SubaruEyesightWriteEntry[] = [];
  const seen = new Set<string>();
  for (const item of obj.restore35xxDids) {
    if (!item || typeof item !== "object") {
      return { ok: false, errorRu: "Некорректная запись DID в restore35xxDids." };
    }
    const rec = item as Record<string, unknown>;
    const did = typeof rec.did === "string" ? rec.did.trim().toUpperCase() : "";
    const byteHex = typeof rec.byteHex === "string" ? rec.byteHex.trim().toUpperCase() : "";
    if (!isWritableEyesightVariantDid(did)) {
      return {
        ok: false,
        errorRu: `Недопустимый DID «${did}» в бэкапе EyeSight (разрешены только 3501..3510 и 3091..309D).`,
      };
    }
    if (!/^[0-9A-F]{2}$/.test(byteHex)) {
      return {
        ok: false,
        errorRu: `Некорректное значение байта «${byteHex}» для DID ${did}.`,
      };
    }
    if (!seen.has(did)) {
      seen.add(did);
      restore35xxDids.push({ did, byteHex });
    }
  }

  const appliedModel =
    typeof obj.appliedModel === "string" ? obj.appliedModel.trim().toUpperCase() : "BTAEYR8";
  const inferredOptionCode =
    typeof obj.inferredOptionCode === "string"
      ? obj.inferredOptionCode.trim().toUpperCase()
      : "UNKNOWN";
  const stickerOptionCode =
    typeof obj.stickerOptionCode === "string" && obj.stickerOptionCode.trim().length === 4
      ? obj.stickerOptionCode.trim().toUpperCase()
      : null;

  const dids: SubaruEyesightDidEntry[] = Array.isArray(obj.dids)
    ? obj.dids
        .filter((d): d is Record<string, unknown> => Boolean(d && typeof d === "object"))
        .map((d) => ({
          did: typeof d.did === "string" ? d.did.toUpperCase() : "",
          label: typeof d.label === "string" ? d.label : "",
          hex: typeof d.hex === "string" ? d.hex.toUpperCase() : "",
          decoded: typeof d.decoded === "string" ? d.decoded : "",
        }))
        .filter((d) => d.did.length > 0)
    : [];

  const absent35xxDids = Array.isArray(obj.absent35xxDids)
    ? obj.absent35xxDids.filter((x): x is string => typeof x === "string")
    : [];

  const catalogComparison =
    obj.catalogComparison && typeof obj.catalogComparison === "object"
      ? (obj.catalogComparison as Ssm4EyesightCatalogSummary)
      : summarizeEyesightCatalogComparison(appliedModel, extractEyesightDidHexMap(dids));

  const dest = obj.destinationHint;
  const destinationHint: "USA" | "CANADA" | "UNKNOWN" =
    dest === "USA" || dest === "CANADA" ? dest : "UNKNOWN";

  return {
    ok: true,
    backup: {
      format: SUBARU_EYESIGHT_BACKUP_FORMAT,
      savedAt: typeof obj.savedAt === "string" ? obj.savedAt : new Date().toISOString(),
      vin: typeof obj.vin === "string" ? obj.vin : null,
      txHex: typeof obj.txHex === "string" ? obj.txHex : "787",
      rxHex: typeof obj.rxHex === "string" ? obj.rxHex : "78F",
      appliedModel,
      inferredOptionCode,
      stickerOptionCode,
      destinationHint,
      dids,
      restore35xxDids,
      absent35xxDids,
      catalogComparison,
    },
  };
}

export function diffBackupVsLiveEyesight(
  backup: SubaruEyesightBackupFile,
  liveDids: readonly { did: string; hex: string }[],
): SubaruEyesightBackupLiveDiff {
  const liveMap = extractEyesightDidHexMap(liveDids);
  const changed: SubaruEyesightBackupLiveDiffItem[] = [];
  let unchangedCount = 0;

  for (const item of backup.restore35xxDids) {
    const rawLive = liveMap[item.did];
    const liveByte =
      rawLive && rawLive !== "--" ? (rawLive.split(/\s+/)[0] ?? "").slice(0, 2) : "--";
    if (liveByte === item.byteHex) {
      unchangedCount++;
    } else {
      changed.push({
        did: item.did,
        backupHex: item.byteHex,
        liveHex: liveByte || "--",
      });
    }
  }

  return {
    changed,
    unchangedCount,
    totalBackupWritable: backup.restore35xxDids.length,
  };
}
