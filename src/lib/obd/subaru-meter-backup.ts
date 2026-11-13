import {
  SUBARU_METER_ALL_VARIANT_A0XX_DIDS,
  summarizeMeterCatalogComparison,
  type Ssm4MeterCatalogSummary,
  type SubaruDumpCodeMatch,
} from "./subaru-ssm4-catalog";

export const SUBARU_METER_BACKUP_FORMAT = "qhub-subaru-meter-backup-v1" as const;

const SUPPORT_BITMAP_A0_DIDS = new Set(["A000", "A020", "A040", "A060"]);
const ALL_VARIANT_A0_SET = new Set<string>(SUBARU_METER_ALL_VARIANT_A0XX_DIDS);

export interface SubaruMeterDidEntry {
  did: string;
  label: string;
  hex: string;
  decoded: string;
}

export interface SubaruMeterA0xxWriteEntry {
  did: string;
  byteHex: string;
}

export interface SubaruMeterBackupFile {
  format: typeof SUBARU_METER_BACKUP_FORMAT;
  savedAt: string;
  vin: string | null;
  txHex: string;
  rxHex: string;
  appliedModel: string;
  inferredOptionCode: string;
  stickerOptionCode: string | null;
  inferredRegion: string;
  /** Full snapshot of all DIDs read from the Combination Meter (mHZ + A0xx + passport). */
  dids: SubaruMeterDidEntry[];
  /** Present 1-byte A0xx DIDs (without support bitmaps A000/A020/A040) for 1:1 restoration. */
  restoreA0xxDids: SubaruMeterA0xxWriteEntry[];
  /** Variant A0xx DIDs that returned NRC / absent (`--`) on this meter. */
  absentA0xxDids: string[];
  /** Recorded differences between the original meter dump and every cgdw row for Applied Model. */
  catalogComparison: Ssm4MeterCatalogSummary;
}

export interface SubaruMeterBackupLiveDiffItem {
  did: string;
  backupHex: string;
  liveHex: string;
}

export interface SubaruMeterBackupLiveDiff {
  changed: SubaruMeterBackupLiveDiffItem[];
  unchangedCount: number;
  totalBackupWritable: number;
}

export function isWritableMeterA0xxDid(did: string): boolean {
  const clean = did.trim().toUpperCase();
  if (!/^A0[0-9A-F]{2}$/.test(clean)) return false;
  return !SUPPORT_BITMAP_A0_DIDS.has(clean);
}

export function extractDidHexMap(dids: readonly { did: string; hex: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of dids) {
    out[d.did.trim().toUpperCase()] = d.hex.trim().toUpperCase();
  }
  return out;
}

export function buildSubaruMeterBackup(
  read: {
    capturedAt?: string;
    vin: string | null;
    txHex: string;
    rxHex: string;
    dids: SubaruMeterDidEntry[];
    match: SubaruDumpCodeMatch;
  },
  stickerOptionCode?: string | null,
): SubaruMeterBackupFile {
  const didMap = extractDidHexMap(read.dids);
  const appliedModel = read.match.actualAppliedModel || "BTAEYR8";
  const cleanSticker =
    stickerOptionCode
      ?.trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4) || null;

  const restoreA0xxDids: SubaruMeterA0xxWriteEntry[] = [];
  const absentSet = new Set<string>();
  const seenWritable = new Set<string>();

  for (const entry of read.dids) {
    const did = entry.did.trim().toUpperCase();
    if (!isWritableMeterA0xxDid(did)) continue;
    const rawHex = entry.hex.trim().toUpperCase();
    if (!rawHex || rawHex === "--" || rawHex === "ABSENT") {
      absentSet.add(did);
      continue;
    }
    const firstByte = (rawHex.split(/\s+/)[0] ?? "").slice(0, 2);
    if (/^[0-9A-F]{2}$/.test(firstByte) && !seenWritable.has(did)) {
      seenWritable.add(did);
      restoreA0xxDids.push({ did, byteHex: firstByte });
    }
  }

  for (const variantDid of ALL_VARIANT_A0_SET) {
    if (!seenWritable.has(variantDid) && !absentSet.has(variantDid)) {
      const v = didMap[variantDid];
      if (!v || v === "--") absentSet.add(variantDid);
    }
  }

  restoreA0xxDids.sort((a, b) => a.did.localeCompare(b.did));
  const absentA0xxDids = [...absentSet].sort((a, b) => a.localeCompare(b));

  const catalogComparison = summarizeMeterCatalogComparison(appliedModel, didMap);

  return {
    format: SUBARU_METER_BACKUP_FORMAT,
    savedAt: read.capturedAt || new Date().toISOString(),
    vin: read.vin,
    txHex: read.txHex,
    rxHex: read.rxHex,
    appliedModel,
    inferredOptionCode: read.match.actualOptionCode,
    stickerOptionCode: cleanSticker && cleanSticker.length === 4 ? cleanSticker : null,
    inferredRegion: read.match.actualRegion,
    dids: read.dids.map((d) => ({ ...d })),
    restoreA0xxDids,
    absentA0xxDids,
    catalogComparison,
  };
}

export function serializeSubaruMeterBackup(backup: SubaruMeterBackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export function suggestSubaruMeterBackupFilename(backup: SubaruMeterBackupFile): string {
  const vinTail = backup.vin && backup.vin.length >= 6 ? backup.vin.slice(-8) : "NOVIN";
  const opt = backup.stickerOptionCode || backup.inferredOptionCode || "ORIG";
  const date = (backup.savedAt || new Date().toISOString()).slice(0, 10);
  return `subaru-meter-${backup.appliedModel}-${opt}-${vinTail}-${date}.json`;
}

export function parseSubaruMeterBackupJson(
  rawText: string,
): { ok: true; backup: SubaruMeterBackupFile } | { ok: false; errorRu: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, errorRu: "Файл не является корректным JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, errorRu: "Пустой или некорректный объект бэкапа." };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.format !== SUBARU_METER_BACKUP_FORMAT) {
    return {
      ok: false,
      errorRu: `Неподдерживаемый формат файла (ожидается ${SUBARU_METER_BACKUP_FORMAT}).`,
    };
  }
  if (!Array.isArray(obj.restoreA0xxDids) || obj.restoreA0xxDids.length === 0) {
    return {
      ok: false,
      errorRu: "В файле бэкапа нет списка вариантных DID (restoreA0xxDids).",
    };
  }

  const restoreA0xxDids: SubaruMeterA0xxWriteEntry[] = [];
  const seen = new Set<string>();
  for (const item of obj.restoreA0xxDids) {
    if (!item || typeof item !== "object") {
      return { ok: false, errorRu: "Некорректная запись DID в restoreA0xxDids." };
    }
    const rec = item as Record<string, unknown>;
    const did = typeof rec.did === "string" ? rec.did.trim().toUpperCase() : "";
    const byteHex = typeof rec.byteHex === "string" ? rec.byteHex.trim().toUpperCase() : "";
    if (!isWritableMeterA0xxDid(did)) {
      return {
        ok: false,
        errorRu: `Недопустимый DID «${did}» в бэкапе (разрешены только 1-байтовые вариантные DID A0xx).`,
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
      restoreA0xxDids.push({ did, byteHex });
    }
  }

  const appliedModel =
    typeof obj.appliedModel === "string" ? obj.appliedModel.trim().toUpperCase() : "BTAEYR8";
  const inferredOptionCode =
    typeof obj.inferredOptionCode === "string" ? obj.inferredOptionCode.trim().toUpperCase() : "U45D";
  const stickerOptionCode =
    typeof obj.stickerOptionCode === "string" && obj.stickerOptionCode.trim().length === 4
      ? obj.stickerOptionCode.trim().toUpperCase()
      : null;

  const dids: SubaruMeterDidEntry[] = Array.isArray(obj.dids)
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

  const absentA0xxDids = Array.isArray(obj.absentA0xxDids)
    ? obj.absentA0xxDids.filter((x): x is string => typeof x === "string")
    : [];

  const catalogComparison =
    obj.catalogComparison && typeof obj.catalogComparison === "object"
      ? (obj.catalogComparison as Ssm4MeterCatalogSummary)
      : summarizeMeterCatalogComparison(appliedModel, extractDidHexMap(dids));

  return {
    ok: true,
    backup: {
      format: SUBARU_METER_BACKUP_FORMAT,
      savedAt: typeof obj.savedAt === "string" ? obj.savedAt : new Date().toISOString(),
      vin: typeof obj.vin === "string" ? obj.vin : null,
      txHex: typeof obj.txHex === "string" ? obj.txHex : "783",
      rxHex: typeof obj.rxHex === "string" ? obj.rxHex : "78B",
      appliedModel,
      inferredOptionCode,
      stickerOptionCode,
      inferredRegion: typeof obj.inferredRegion === "string" ? obj.inferredRegion : "UNKNOWN",
      dids,
      restoreA0xxDids,
      absentA0xxDids,
      catalogComparison,
    },
  };
}

export function diffBackupVsLiveMeter(
  backup: SubaruMeterBackupFile,
  liveDids: readonly { did: string; hex: string }[],
): SubaruMeterBackupLiveDiff {
  const liveMap = extractDidHexMap(liveDids);
  const changed: SubaruMeterBackupLiveDiffItem[] = [];
  let unchangedCount = 0;

  for (const item of backup.restoreA0xxDids) {
    const rawLive = liveMap[item.did];
    const liveByte = rawLive && rawLive !== "--" ? (rawLive.split(/\s+/)[0] ?? "").slice(0, 2) : "--";
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
    totalBackupWritable: backup.restoreA0xxDids.length,
  };
}
