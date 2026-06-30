import { platformFetch } from "./api-client";
import { PlatformNetwork } from "./network";
import { openPlatformStore } from "./storage";
import { PlatformLogger } from "./logger";

export interface QueuedOperation {
  id: string;
  type: string;
  endpoint: string;
  payload: unknown;
  headers?: Record<string, string>;
  createdAt: number;
  attempts: number;
}

const MAX_ATTEMPTS = 8;
const FLUSH_LOCK: { running: boolean } = { running: false };

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function readAllPending(): Promise<QueuedOperation[]> {
  const store = await openPlatformStore("offline_queue", "readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result as QueuedOperation[]).sort((a, b) => a.createdAt - b.createdAt);
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

async function saveOp(op: QueuedOperation): Promise<void> {
  const store = await openPlatformStore("offline_queue", "readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = store.put(op);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteOp(id: string): Promise<void> {
  const store = await openPlatformStore("offline_queue", "readwrite");
  await new Promise<void>((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function sendOp(op: QueuedOperation): Promise<boolean> {
  try {
    const res = await platformFetch(op.endpoint, {
      method: "POST",
      body: JSON.stringify(op.payload),
      headers: op.headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const PlatformOfflineQueue = {
  async enqueue(
    op: Omit<QueuedOperation, "id" | "createdAt" | "attempts">,
  ): Promise<void> {
    if (PlatformNetwork.isOnline()) {
      const ok = await sendOp({ ...op, id: "", createdAt: 0, attempts: 0 });
      if (ok) return;
    }

    await saveOp({
      ...op,
      id: generateId(),
      createdAt: Date.now(),
      attempts: 0,
    });
  },

  async getPending(): Promise<QueuedOperation[]> {
    return readAllPending();
  },

  async flush(): Promise<void> {
    if (FLUSH_LOCK.running || !PlatformNetwork.isOnline()) return;
    FLUSH_LOCK.running = true;
    try {
      const pending = await readAllPending();
      for (const op of pending) {
        if (!PlatformNetwork.isOnline()) break;
        const ok = await sendOp(op);
        if (ok) {
          await deleteOp(op.id);
          continue;
        }
        const nextAttempts = op.attempts + 1;
        if (nextAttempts >= MAX_ATTEMPTS) {
          PlatformLogger.warn("Offline queue dropping operation after max attempts", { id: op.id });
          await deleteOp(op.id);
          continue;
        }
        await saveOp({ ...op, attempts: nextAttempts });
        break;
      }
    } finally {
      FLUSH_LOCK.running = false;
    }
  },
};

if (typeof window !== "undefined") {
  PlatformNetwork.onOnline(() => {
    void PlatformOfflineQueue.flush();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void PlatformOfflineQueue.flush();
  });
}
