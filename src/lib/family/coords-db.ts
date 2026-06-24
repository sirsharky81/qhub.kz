import type { FamilyLocation } from "./types";

const DB_NAME = "qhub-family";
const DB_VERSION = 1;
const STORE_SETTINGS = "settings";
const STORE_FAMILIES = "families";
const STORE_COORDS = "coords";

export interface FamilySettings {
  id: "default";
  pushEnabled: boolean;
}

export interface FamilyCacheEntry {
  roomId: string;
  roomName: string;
  memberId: string;
  role: string;
  name: string;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_FAMILIES)) {
        db.createObjectStore(STORE_FAMILIES, { keyPath: "roomId" });
      }
      if (!db.objectStoreNames.contains(STORE_COORDS)) {
        db.createObjectStore(STORE_COORDS, { keyPath: "memberId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  return openDb().then(
    (db) =>
      new Promise<T | void>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = fn(store);
        if (request) {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        } else {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        }
      }),
  );
}

export async function getFamilySettings(): Promise<FamilySettings> {
  const result = (await tx<FamilySettings>(STORE_SETTINGS, "readonly", (s) => s.get("default"))) as
    | FamilySettings
    | undefined;
  return result ?? { id: "default", pushEnabled: true };
}

export async function saveFamilySettings(settings: FamilySettings): Promise<void> {
  await tx(STORE_SETTINGS, "readwrite", (s) => s.put(settings));
}

export async function saveFamilyCache(entry: FamilyCacheEntry): Promise<void> {
  await tx(STORE_FAMILIES, "readwrite", (s) => s.put(entry));
}

export async function listFamilyCache(): Promise<FamilyCacheEntry[]> {
  const result = (await tx<FamilyCacheEntry[]>(STORE_FAMILIES, "readonly", (s) => s.getAll())) as
    | FamilyCacheEntry[]
    | undefined;
  return result ?? [];
}

/** One coordinate record per member — put replaces previous. */
export async function cacheMemberCoords(location: FamilyLocation): Promise<void> {
  await tx(STORE_COORDS, "readwrite", (s) => s.put(location));
}

export async function getCachedCoords(): Promise<FamilyLocation[]> {
  const result = (await tx<FamilyLocation[]>(STORE_COORDS, "readonly", (s) => s.getAll())) as
    | FamilyLocation[]
    | undefined;
  return result ?? [];
}

export async function getCachedCoord(memberId: string): Promise<FamilyLocation | null> {
  const result = (await tx<FamilyLocation>(STORE_COORDS, "readonly", (s) => s.get(memberId))) as
    | FamilyLocation
    | undefined;
  return result ?? null;
}

export async function clearFamilyCache(): Promise<void> {
  await tx(STORE_FAMILIES, "readwrite", (s) => s.clear());
  await tx(STORE_COORDS, "readwrite", (s) => s.clear());
}
