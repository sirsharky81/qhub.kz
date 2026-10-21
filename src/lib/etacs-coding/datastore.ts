import fs from "node:fs";
import path from "node:path";
import { resetDiagCatalogCache } from "@/lib/etacs-coding/diag-catalog";

const EXCLUDED_DICT_FILES = new Set([
  "crc.json",
  "mut-diag-db.json",
  "mut-coding-catalog.json",
  "index.json",
]);

export interface DictionaryParameter {
  id: number;
  name: string;
  nameRu?: string;
  baselineLabel?: string;
  bitfield?: {
    byteIndex: number;
    byteLen?: number;
    bitPos?: number;
    bitLen?: number;
  };
  mask?: string;
  options?: Array<{ label: string; labelRu?: string; value?: number; bytes?: string }>;
  outsideMut?: boolean;
  detail?: string;
  note?: string;
}

export interface BlockDictionary {
  id: string;
  ecuId?: string;
  ecuName?: string;
  skey?: string;
  model?: string;
  unit?: string;
  kind?: string;
  codingBytes?: number;
  parameterCount?: number;
  baselineHex?: string;
  parameters: DictionaryParameter[];
  partNumbers?: string[];
  partPrefixes?: string[];
  chassisPrefixes?: string[];
  readOnly?: boolean;
  statusNote?: string;
  status?: string;
  masksComplete?: boolean;
}

interface DictionaryIndex {
  partDictionaries: unknown[];
  blocks: Array<{ id: string; codingBytes: number }>;
}

let cachedDedicated: BlockDictionary[] | null = null;
let cachedIndex: DictionaryIndex | null = null;
const blockCache = new Map<string, BlockDictionary>();

export function getEtacsDictionaryDir(): string | null {
  const fromEnv = process.env.ETACS_DICTIONARY_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return null;
}

export function isEtacsDictionaryReady(): boolean {
  const dir = getEtacsDictionaryDir();
  if (!dir) return false;
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** Clears in-memory caches after rsync deploy (call from admin hook or process restart). */
export function resetEtacsDictionaryCache(): void {
  cachedDedicated = null;
  cachedIndex = null;
  blockCache.clear();
  resetDiagCatalogCache();
}

function dictionaryRoot(): string {
  const dir = getEtacsDictionaryDir();
  if (!dir) {
    throw new Error("ETACS_DICTIONARY_DIR не задан");
  }
  if (!fs.existsSync(dir)) {
    throw new Error("Каталог справочников ETACS недоступен");
  }
  return dir;
}

export function loadDedicatedDictionaries(): BlockDictionary[] {
  if (cachedDedicated) return cachedDedicated;
  const dir = dictionaryRoot();
  cachedDedicated = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith(".json") && !EXCLUDED_DICT_FILES.has(entry.name),
    )
    .map((entry) => {
      const data = JSON.parse(
        fs.readFileSync(path.join(dir, entry.name), "utf8"),
      ) as BlockDictionary;
      return {
        ...data,
        id: data.id || entry.name.replace(/\.json$/i, ""),
        codingBytes:
          data.codingBytes ||
          (data.baselineHex ? data.baselineHex.length / 2 : 0),
      };
    })
    .filter((data) => data && data.ecuId && data.baselineHex);
  return cachedDedicated;
}

export function loadDictionaryIndex(): DictionaryIndex {
  if (cachedIndex) return cachedIndex;
  const indexPath = path.join(dictionaryRoot(), "index.json");
  if (!fs.existsSync(indexPath)) {
    cachedIndex = { partDictionaries: [], blocks: [] };
    return cachedIndex;
  }
  cachedIndex = JSON.parse(fs.readFileSync(indexPath, "utf8")) as DictionaryIndex;
  return cachedIndex;
}

export function loadBlockDictionaryById(blockId: string): BlockDictionary | null {
  if (!blockId) return null;
  if (blockCache.has(blockId)) return blockCache.get(blockId) ?? null;
  const safeName = `${path.basename(String(blockId).replace(/\.json$/i, ""))}.json`;
  const blockPath = path.join(dictionaryRoot(), "blocks", safeName);
  if (!fs.existsSync(blockPath)) return null;
  const data = JSON.parse(fs.readFileSync(blockPath, "utf8")) as BlockDictionary;
  blockCache.set(blockId, data);
  return data;
}
