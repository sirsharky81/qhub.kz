import type { InstrumentId, TunerSettings } from "./types";

const DB_NAME = "qhub-guitar-tuner";
const DB_VERSION = 1;
const STORE = "settings";

const DEFAULT_SETTINGS: TunerSettings = {
  instrumentId: "guitar",
  tuningId: "standard",
  selectedStringIndex: null,
  micDeviceId: null,
  a4CalibrationCents: 0,
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function loadTunerSettings(): Promise<TunerSettings> {
  if (typeof indexedDB === "undefined") return DEFAULT_SETTINGS;
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get("main");
      req.onsuccess = () => {
        resolve({ ...DEFAULT_SETTINGS, ...(req.result as TunerSettings | undefined) });
      };
      req.onerror = () => resolve(DEFAULT_SETTINGS);
    });
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveTunerSettings(settings: Partial<TunerSettings>): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const current = await loadTunerSettings();
  const merged = { ...current, ...settings };
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id: "main", ...merged });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function a4FromCalibration(cents: number): number {
  return 440 * Math.pow(2, cents / 1200);
}

export function isValidInstrumentId(id: string): id is InstrumentId {
  return id === "guitar" || id === "bass" || id === "ukulele" || id === "chromatic";
}
