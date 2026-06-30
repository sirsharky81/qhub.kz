const DB_NAME = "qhub-platform";
const DB_VERSION = 1;

type StoreName = "kv" | "offline_queue";

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
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv");
      }
      if (!db.objectStoreNames.contains("offline_queue")) {
        const store = db.createObjectStore("offline_queue", { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = fn(store);
    if (request) {
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    } else {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    }
  });
}

export const PlatformStorage = {
  async get<T>(table: string, key: string): Promise<T | null> {
    const compositeKey = `${table}:${key}`;
    const result = await tx<IDBValidKey>("kv", "readonly", (store) =>
      store.get(compositeKey),
    );
    return (result as T | undefined) ?? null;
  },

  async set<T>(table: string, key: string, value: T): Promise<void> {
    const compositeKey = `${table}:${key}`;
    await tx("kv", "readwrite", (store) => store.put(value, compositeKey));
  },

  async delete(table: string, key: string): Promise<void> {
    const compositeKey = `${table}:${key}`;
    await tx("kv", "readwrite", (store) => store.delete(compositeKey));
  },

  async query<T>(table: string, filter?: Record<string, unknown>): Promise<T[]> {
    const prefix = `${table}:`;
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("kv", "readonly");
      const store = transaction.objectStore("kv");
      const request = store.openCursor();
      const results: T[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(results);
          return;
        }
        const key = String(cursor.key);
        if (key.startsWith(prefix)) {
          const value = cursor.value as T;
          if (!filter || Object.entries(filter).every(([k, v]) => (value as Record<string, unknown>)[k] === v)) {
            results.push(value);
          }
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  },
};

export async function openPlatformStore(
  storeName: StoreName,
  mode: IDBTransactionMode,
): Promise<IDBObjectStore> {
  const db = await openDb();
  return db.transaction(storeName, mode).objectStore(storeName);
}
