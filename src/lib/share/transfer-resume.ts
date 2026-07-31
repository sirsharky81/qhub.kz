const DB_NAME = "qhub-share-resume";
const DB_VERSION = 2;
const STORE = "files";
const CHUNK_STORE = "chunks";

export interface ResumeFileState {
  key: string;
  roomId: string;
  transferId: string;
  fileId: string;
  relativePath: string;
  size: number;
  sha256: string;
  /** Highest contiguous byte offset received (exclusive). */
  contiguousOffset: number;
  chunkKeys: number[];
  updatedAt: number;
}

function resumeKey(roomId: string, fileId: string): string {
  return `${roomId}:${fileId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        db.createObjectStore(CHUNK_STORE);
      }
      const tx = (event.target as IDBOpenDBRequest).transaction;
      if (tx && db.objectStoreNames.contains(CHUNK_STORE) && event.oldVersion < 2) {
        /* fresh chunk store for resume */
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb_open_failed"));
  });
}

export async function loadResumeState(
  roomId: string,
  fileId: string,
): Promise<ResumeFileState | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(resumeKey(roomId, fileId));
    req.onsuccess = () => resolve((req.result as ResumeFileState | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("idb_get_failed"));
  });
}

export async function saveResumeState(state: ResumeFileState): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...state, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb_put_failed"));
  });
}

function chunkKey(roomId: string, fileId: string, offset: number): string {
  return `${roomId}:${fileId}:${offset}`;
}

export async function saveChunk(
  roomId: string,
  fileId: string,
  offset: number,
  data: ArrayBuffer,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CHUNK_STORE, "readwrite");
    tx.objectStore(CHUNK_STORE).put(data, chunkKey(roomId, fileId, offset));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb_chunk_put_failed"));
  });
}

export async function loadSavedChunks(
  roomId: string,
  fileId: string,
  chunkKeys: number[],
): Promise<Map<number, ArrayBuffer>> {
  const parts = new Map<number, ArrayBuffer>();
  if (typeof indexedDB === "undefined" || !chunkKeys.length) return parts;
  const db = await openDb();
  await Promise.all(
    chunkKeys.map(
      (offset) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(CHUNK_STORE, "readonly");
          const req = tx.objectStore(CHUNK_STORE).get(chunkKey(roomId, fileId, offset));
          req.onsuccess = () => {
            if (req.result) parts.set(offset, req.result as ArrayBuffer);
            resolve();
          };
          req.onerror = () => reject(req.error ?? new Error("idb_chunk_get_failed"));
        }),
    ),
  );
  return parts;
}

export async function clearResumeState(roomId: string, fileId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const state = await loadResumeState(roomId, fileId);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, CHUNK_STORE], "readwrite");
    tx.objectStore(STORE).delete(resumeKey(roomId, fileId));
    if (state?.chunkKeys?.length) {
      for (const offset of state.chunkKeys) {
        tx.objectStore(CHUNK_STORE).delete(chunkKey(roomId, fileId, offset));
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb_del_failed"));
  });
}

export function computeContiguousOffset(parts: Map<number, ArrayBuffer>, totalSize: number): number {
  let offset = 0;
  while (offset < totalSize) {
    const part = parts.get(offset);
    if (!part) break;
    offset += part.byteLength;
  }
  return offset;
}

export async function persistReceiveProgress(input: {
  roomId: string;
  transferId: string;
  fileId: string;
  relativePath: string;
  size: number;
  sha256: string;
  parts: Map<number, ArrayBuffer>;
  latestOffset?: number;
  latestData?: ArrayBuffer;
}): Promise<number> {
  if (input.latestOffset != null && input.latestData) {
    await saveChunk(input.roomId, input.fileId, input.latestOffset, input.latestData);
  }
  const contiguousOffset = computeContiguousOffset(input.parts, input.size);
  await saveResumeState({
    key: resumeKey(input.roomId, input.fileId),
    roomId: input.roomId,
    transferId: input.transferId,
    fileId: input.fileId,
    relativePath: input.relativePath,
    size: input.size,
    sha256: input.sha256,
    contiguousOffset,
    chunkKeys: [...input.parts.keys()].sort((a, b) => a - b),
    updatedAt: Date.now(),
  });
  return contiguousOffset;
}
