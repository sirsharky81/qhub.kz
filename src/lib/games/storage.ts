const DB_NAME = "qhub-games";
const DB_VERSION = 2;

type StoreName = "hearts_state" | "spider_state" | "settings" | "stats";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("hearts_state")) db.createObjectStore("hearts_state");
      if (!db.objectStoreNames.contains("spider_state")) db.createObjectStore("spider_state");
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
      if (!db.objectStoreNames.contains("stats")) db.createObjectStore("stats");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = op(store);
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

export interface HeartsStats {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  shootTheMoonCount: number;
  averagePenalty: number;
  bestPenalty: number | null;
}

export interface HeartsSettings {
  language: "ru" | "en" | "kk";
  theme: "light" | "dark" | "system";
  sound: boolean;
  vibration: boolean;
  animationSpeed: "slow" | "normal" | "fast";
  aiLevel: "easy" | "medium" | "hard";
  autoSortCards: boolean;
}

export const DEFAULT_HEARTS_SETTINGS: HeartsSettings = {
  language: "ru",
  theme: "system",
  sound: true,
  vibration: true,
  animationSpeed: "normal",
  aiLevel: "medium",
  autoSortCards: true,
};

export const DEFAULT_HEARTS_STATS: HeartsStats = {
  games: 0,
  wins: 0,
  losses: 0,
  winRate: 0,
  shootTheMoonCount: 0,
  averagePenalty: 0,
  bestPenalty: null,
};

export async function saveHeartsState(state: unknown): Promise<void> {
  await tx("hearts_state", "readwrite", (store) => store.put(state, "current"));
}

export async function loadHeartsState<T>(): Promise<T | null> {
  const value = await tx<IDBValidKey>("hearts_state", "readonly", (store) => store.get("current"));
  return (value as T | undefined) ?? null;
}

export async function saveHeartsSettings(settings: HeartsSettings): Promise<void> {
  await tx("settings", "readwrite", (store) => store.put(settings, "hearts"));
}

export async function loadHeartsSettings(): Promise<HeartsSettings> {
  const value = await tx<IDBValidKey>("settings", "readonly", (store) => store.get("hearts"));
  return { ...DEFAULT_HEARTS_SETTINGS, ...(((value as unknown) as HeartsSettings | undefined) ?? {}) };
}

export async function saveHeartsStats(stats: HeartsStats): Promise<void> {
  await tx("stats", "readwrite", (store) => store.put(stats, "hearts"));
}

export async function loadHeartsStats(): Promise<HeartsStats> {
  const value = await tx<IDBValidKey>("stats", "readonly", (store) => store.get("hearts"));
  return { ...DEFAULT_HEARTS_STATS, ...(((value as unknown) as HeartsStats | undefined) ?? {}) };
}

export interface SpiderStats {
  games: number;
  wins: number;
  bestMoves: number | null;
  bestTimeSec: number | null;
}

export const DEFAULT_SPIDER_STATS: SpiderStats = {
  games: 0,
  wins: 0,
  bestMoves: null,
  bestTimeSec: null,
};

export async function saveSpiderState(state: unknown): Promise<void> {
  await tx("spider_state", "readwrite", (store) => store.put(state, "current"));
}

export async function loadSpiderState<T>(): Promise<T | null> {
  const value = await tx<IDBValidKey>("spider_state", "readonly", (store) => store.get("current"));
  return (value as T | undefined) ?? null;
}

export async function clearSpiderState(): Promise<void> {
  await tx("spider_state", "readwrite", (store) => store.delete("current"));
}

export async function saveSpiderStats(stats: SpiderStats): Promise<void> {
  await tx("stats", "readwrite", (store) => store.put(stats, "spider"));
}

export async function loadSpiderStats(): Promise<SpiderStats> {
  const value = await tx<IDBValidKey>("stats", "readonly", (store) => store.get("spider"));
  return { ...DEFAULT_SPIDER_STATS, ...(((value as unknown) as SpiderStats | undefined) ?? {}) };
}
