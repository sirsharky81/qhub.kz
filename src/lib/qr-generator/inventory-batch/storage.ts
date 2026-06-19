import type { InventoryLabelBatch } from "./types";

const DB_NAME = "qhub-qr-generator";
const DB_VERSION = 1;
const BATCH_STORE = "inventoryLabelBatches";
const ACTIVE_BATCH_KEY = "qhub-qr-active-batch-id";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexeddb_unavailable"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BATCH_STORE)) {
        db.createObjectStore(BATCH_STORE, { keyPath: "batchId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txPut(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function txGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function txDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function getActiveBatchId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(ACTIVE_BATCH_KEY);
}

export function setActiveBatchId(batchId: string | null): void {
  if (typeof localStorage === "undefined") return;
  if (batchId) localStorage.setItem(ACTIVE_BATCH_KEY, batchId);
  else localStorage.removeItem(ACTIVE_BATCH_KEY);
}

export async function saveBatch(batch: InventoryLabelBatch): Promise<void> {
  const db = await openDb();
  const payload = { ...batch, updatedAt: Date.now() };
  await txPut(db, BATCH_STORE, payload);
  setActiveBatchId(payload.batchId);
}

export async function loadBatch(batchId: string): Promise<InventoryLabelBatch | null> {
  const db = await openDb();
  return txGet<InventoryLabelBatch>(db, BATCH_STORE, batchId);
}

export async function loadActiveBatch(): Promise<InventoryLabelBatch | null> {
  const id = getActiveBatchId();
  if (!id) return null;
  return loadBatch(id);
}

export async function deleteBatch(batchId: string): Promise<void> {
  const db = await openDb();
  await txDelete(db, BATCH_STORE, batchId);
  if (getActiveBatchId() === batchId) setActiveBatchId(null);
}

export async function clearActiveBatch(): Promise<void> {
  const id = getActiveBatchId();
  if (id) await deleteBatch(id);
}
