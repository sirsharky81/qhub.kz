import type { PlainMessage } from "./crypto";
import { decryptFromStorage, encryptForStorage } from "./crypto";
import { UNREAD_EVENT } from "./constants";
import type { DeliveryStatus, MessageType } from "./types";

const DB_NAME = "qhub-messenger";
const DB_VERSION = 1;
const STORE_MESSAGES = "messages";

export interface HistoryMessageRecord {
  id: string;
  chatId: string;
  ts: number;
  mine: boolean;
  type: MessageType;
  deliveryStatus: DeliveryStatus;
  fromPhone?: string;
  quotedMessageId?: string;
  storageCiphertext: string;
  storageIv: string;
}

export interface DecryptedHistoryMessage {
  id: string;
  chatId: string;
  ts: number;
  mine: boolean;
  type: MessageType;
  deliveryStatus: DeliveryStatus;
  fromPhone?: string;
  plain: PlainMessage;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, { keyPath: "id" });
        store.createIndex("chatId", "chatId", { unique: false });
        store.createIndex("chatId_ts", ["chatId", "ts"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  return openDb().then(
    (db) =>
      new Promise<T | void>((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, mode);
        const store = transaction.objectStore(STORE_MESSAGES);
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

export async function saveHistoryMessage(
  storageKey: CryptoKey,
  input: {
    id: string;
    chatId: string;
    ts: number;
    mine: boolean;
    type: MessageType;
    deliveryStatus: DeliveryStatus;
    fromPhone?: string;
    plain: PlainMessage;
  },
): Promise<void> {
  const { ciphertext, iv } = await encryptForStorage(storageKey, input.plain);
  const record: HistoryMessageRecord = {
    id: input.id,
    chatId: input.chatId,
    ts: input.ts,
    mine: input.mine,
    type: input.type,
    deliveryStatus: input.deliveryStatus,
    fromPhone: input.fromPhone,
    quotedMessageId: input.plain.quotedMessageId,
    storageCiphertext: ciphertext,
    storageIv: iv,
  };
  await tx("readwrite", (store) => store.put(record));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNREAD_EVENT));
  }
}

export async function updateHistoryDeliveryStatus(
  messageId: string,
  deliveryStatus: DeliveryStatus,
): Promise<void> {
  const record = await tx<HistoryMessageRecord>("readonly", (store) => store.get(messageId));
  if (!record) return;
  await tx("readwrite", (store) =>
    store.put({ ...record, deliveryStatus }),
  );
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNREAD_EVENT));
  }
}

export async function loadChatHistory(
  storageKey: CryptoKey,
  chatId: string,
): Promise<DecryptedHistoryMessage[]> {
  const db = await openDb();
  const records = await new Promise<HistoryMessageRecord[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_MESSAGES, "readonly");
    const store = transaction.objectStore(STORE_MESSAGES);
    const index = store.index("chatId");
    const request = index.getAll(chatId);
    request.onsuccess = () => resolve(request.result as HistoryMessageRecord[]);
    request.onerror = () => reject(request.error);
  });

  const sorted = records.sort((a, b) => a.ts - b.ts);
  const result: DecryptedHistoryMessage[] = [];
  for (const rec of sorted) {
    try {
      const plain = await decryptFromStorage(storageKey, rec.storageCiphertext, rec.storageIv);
      result.push({
        id: rec.id,
        chatId: rec.chatId,
        ts: rec.ts,
        mine: rec.mine,
        type: rec.type,
        deliveryStatus: rec.deliveryStatus,
        fromPhone: rec.fromPhone,
        plain,
      });
    } catch {
      // skip undecryptable (e.g. after PIN change)
    }
  }
  return result;
}

export async function clearChatHistory(chatId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_MESSAGES, "readwrite");
    const store = transaction.objectStore(STORE_MESSAGES);
    const index = store.index("chatId");
    const request = index.openCursor(chatId);
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNREAD_EVENT));
  }
}

export async function countUnreadInChat(chatId: string): Promise<number> {
  const db = await openDb();
  const records = await new Promise<HistoryMessageRecord[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_MESSAGES, "readonly");
    const store = transaction.objectStore(STORE_MESSAGES);
    const index = store.index("chatId");
    const request = index.getAll(chatId);
    request.onsuccess = () => resolve(request.result as HistoryMessageRecord[]);
    request.onerror = () => reject(request.error);
  });
  return records.filter((r) => !r.mine && r.deliveryStatus !== "read").length;
}

export async function countAllUnreadDm(): Promise<number> {
  const db = await openDb();
  const records = await new Promise<HistoryMessageRecord[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_MESSAGES, "readonly");
    const store = transaction.objectStore(STORE_MESSAGES);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as HistoryMessageRecord[]);
    request.onerror = () => reject(request.error);
  });
  return records.filter((r) => !r.mine && r.deliveryStatus !== "read").length;
}

/** Check PIN by decrypting one stored message; no_history if IndexedDB is empty. */
export async function verifyStorageKeyAgainstHistory(
  storageKey: CryptoKey,
): Promise<"valid" | "invalid" | "no_history"> {
  const db = await openDb();
  const record = await new Promise<HistoryMessageRecord | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_MESSAGES, "readonly");
    const store = transaction.objectStore(STORE_MESSAGES);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      resolve(cursor ? (cursor.value as HistoryMessageRecord) : null);
    };
    request.onerror = () => reject(request.error);
  });
  if (!record) return "no_history";
  try {
    await decryptFromStorage(storageKey, record.storageCiphertext, record.storageIv);
    return "valid";
  } catch {
    return "invalid";
  }
}

export async function markIncomingAsRead(chatId: string): Promise<void> {
  const db = await openDb();
  const records = await new Promise<HistoryMessageRecord[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_MESSAGES, "readonly");
    const store = transaction.objectStore(STORE_MESSAGES);
    const index = store.index("chatId");
    const request = index.getAll(chatId);
    request.onsuccess = () => resolve(request.result as HistoryMessageRecord[]);
    request.onerror = () => reject(request.error);
  });
  const toUpdate = records.filter((r) => !r.mine && r.deliveryStatus !== "read");
  if (toUpdate.length === 0) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_MESSAGES, "readwrite");
    const store = transaction.objectStore(STORE_MESSAGES);
    for (const rec of toUpdate) {
      store.put({ ...rec, deliveryStatus: "read" });
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNREAD_EVENT));
  }
}
