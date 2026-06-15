import type { ScanDocument, ScanPage } from "./types";
import { resolveWidthFrac } from "./layout-utils";

const DB_NAME = "qhub-document-scanner";
const DB_VERSION = 1;
const DOCS_STORE = "documents";
const BLOBS_STORE = "blobs";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DOCS_STORE)) {
        db.createObjectStore(DOCS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(BLOBS_STORE)) {
        db.createObjectStore(BLOBS_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

interface StoredDocumentMeta {
  id: string;
  name: string;
  pageIds: string[];
  pageNames: string[];
  createdAt: number;
  updatedAt: number;
}

interface StoredBlob {
  key: string;
  blob: Blob;
}

export async function saveDocument(doc: ScanDocument): Promise<void> {
  const db = await openDb();

  const meta: StoredDocumentMeta = {
    id: doc.id,
    name: doc.name,
    pageIds: doc.pages.map((p) => p.id),
    pageNames: doc.pages.map((p) => p.name),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };

  await txPut(db, DOCS_STORE, meta);

  for (const page of doc.pages) {
    const pageKey = `${doc.id}:${page.id}`;
    const pageData = {
      key: pageKey,
      blob: new Blob([JSON.stringify({
        filter: page.filter,
        adjustments: page.adjustments,
        a4FitMode: page.a4FitMode,
        orientation: page.orientation ?? "portrait",
        items: page.items.map((item) => ({
          id: item.id,
          x: item.x,
          y: item.y,
          widthFrac: item.widthFrac,
          rotation: item.rotation,
        })),
      })], { type: "application/json" }),
    };
    await txPut(db, BLOBS_STORE, pageData);

    for (const item of page.items) {
      await txPut(db, BLOBS_STORE, {
        key: `${pageKey}:item:${item.id}`,
        blob: item.imageBlob,
      });
    }
  }
}

export async function loadDocument(id: string): Promise<ScanDocument | null> {
  const db = await openDb();
  const meta = await txGet<StoredDocumentMeta>(db, DOCS_STORE, id);
  if (!meta) return null;

  const pages: ScanPage[] = [];

  for (let i = 0; i < meta.pageIds.length; i++) {
    const pageId = meta.pageIds[i]!;
    const pageKey = `${id}:${pageId}`;
    const pageBlob = await txGet<StoredBlob>(db, BLOBS_STORE, pageKey);
    if (!pageBlob) continue;

    const pageJson = JSON.parse(await pageBlob.blob.text()) as Omit<ScanPage, "id" | "name" | "items"> & {
      items: Omit<ScanPage["items"][0], "imageBlob">[];
    };

    const items = [];
    for (const itemMeta of pageJson.items) {
      const itemBlob = await txGet<StoredBlob>(db, BLOBS_STORE, `${pageKey}:item:${itemMeta.id}`);
      if (!itemBlob) continue;
      items.push({
        ...itemMeta,
        imageBlob: itemBlob.blob,
        widthFrac: resolveWidthFrac(itemMeta),
      });
    }

    pages.push({
      id: pageId,
      name: meta.pageNames[i] ?? `Страница ${i + 1}`,
      filter: pageJson.filter,
      adjustments: pageJson.adjustments,
      a4FitMode: pageJson.a4FitMode,
      orientation: pageJson.orientation ?? "portrait",
      items,
    });
  }

  return {
    id: meta.id,
    name: meta.name,
    pages,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

export async function listDocuments(): Promise<{ id: string; name: string; updatedAt: number; pageCount: number }[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCS_STORE, "readonly");
    const store = tx.objectStore(DOCS_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const docs = (req.result as StoredDocumentMeta[]).map((d) => ({
        id: d.id,
        name: d.name,
        updatedAt: d.updatedAt,
        pageCount: d.pageIds.length,
      }));
      docs.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(docs);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllDocuments(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([DOCS_STORE, BLOBS_STORE], "readwrite");
    tx.objectStore(DOCS_STORE).clear();
    tx.objectStore(BLOBS_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDb();
  const meta = await txGet<StoredDocumentMeta>(db, DOCS_STORE, id);
  if (!meta) return;

  for (const pageId of meta.pageIds) {
    const pageKey = `${id}:${pageId}`;
    const pageBlob = await txGet<StoredBlob>(db, BLOBS_STORE, pageKey);
    if (pageBlob) {
      try {
        const pageJson = JSON.parse(await pageBlob.blob.text()) as {
          items: { id: string }[];
        };
        for (const item of pageJson.items) {
          await txDelete(db, BLOBS_STORE, `${pageKey}:item:${item.id}`);
        }
      } catch {
        // ignore malformed page data
      }
    }
    await txDelete(db, BLOBS_STORE, pageKey);
  }

  await txDelete(db, DOCS_STORE, id);
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
