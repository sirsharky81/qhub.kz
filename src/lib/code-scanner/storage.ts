import type {
  InventoryExportFile,
  InventoryProject,
  InventoryProjectSummary,
  SimpleScanEntry,
  StorageScanEntry,
} from "./types";
import { INVENTORY_EXPORT_VERSION } from "./types";
import { projectToSummary } from "./project-utils";

const DB_NAME = "qhub-code-scanner";
const DB_VERSION = 1;
const PROJECTS_STORE = "projects";
const SIMPLE_SCANS_STORE = "simpleScans";
const STORAGE_SESSION_STORE = "storageSessions";
const ACTIVE_PROJECT_KEY = "activeProjectId";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: "projectId" });
      }
      if (!db.objectStoreNames.contains(SIMPLE_SCANS_STORE)) {
        db.createObjectStore(SIMPLE_SCANS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORAGE_SESSION_STORE)) {
        db.createObjectStore(STORAGE_SESSION_STORE, { keyPath: "id" });
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

function txGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
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

export async function saveProject(project: InventoryProject): Promise<void> {
  const db = await openDb();
  await txPut(db, PROJECTS_STORE, project);
}

export async function loadProject(projectId: string): Promise<InventoryProject | null> {
  const db = await openDb();
  return txGet<InventoryProject>(db, PROJECTS_STORE, projectId);
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = await openDb();
  await txDelete(db, PROJECTS_STORE, projectId);
  if (getActiveProjectId() === projectId) clearActiveProjectId();
}

export async function listProjectSummaries(): Promise<InventoryProjectSummary[]> {
  const db = await openDb();
  const projects = await txGetAll<InventoryProject>(db, PROJECTS_STORE);
  return projects
    .map(projectToSummary)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function listProjectDisplayNumbers(): Promise<string[]> {
  const db = await openDb();
  const projects = await txGetAll<InventoryProject>(db, PROJECTS_STORE);
  return projects.map((p) => p.displayNumber);
}

export function setActiveProjectId(projectId: string): void {
  try {
    localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
  } catch {
    /* ignore */
  }
}

export function getActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function clearActiveProjectId(): void {
  try {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
  } catch {
    /* ignore */
  }
}

export async function saveSimpleScan(entry: SimpleScanEntry): Promise<void> {
  const db = await openDb();
  await txPut(db, SIMPLE_SCANS_STORE, entry);
}

export async function listSimpleScans(limit = 50): Promise<SimpleScanEntry[]> {
  const db = await openDb();
  const all = await txGetAll<SimpleScanEntry>(db, SIMPLE_SCANS_STORE);
  return all.sort((a, b) => b.scannedAt - a.scannedAt).slice(0, limit);
}

export async function saveStorageSessionEntry(entry: StorageScanEntry): Promise<void> {
  const db = await openDb();
  await txPut(db, STORAGE_SESSION_STORE, entry);
}

export async function listStorageSessionEntries(limit = 100): Promise<StorageScanEntry[]> {
  const db = await openDb();
  const all = await txGetAll<StorageScanEntry>(db, STORAGE_SESSION_STORE);
  return all.sort((a, b) => b.scannedAt - a.scannedAt).slice(0, limit);
}

export function exportProjectFile(project: InventoryProject): InventoryExportFile {
  return {
    formatVersion: INVENTORY_EXPORT_VERSION,
    exportedAt: Date.now(),
    project,
  };
}

export async function importProjectFile(file: File): Promise<InventoryProject> {
  const text = await file.text();
  const parsed = JSON.parse(text) as InventoryExportFile | InventoryProject;
  const project = "formatVersion" in parsed && parsed.project ? parsed.project : (parsed as InventoryProject);
  if (!project.projectId) throw new Error("Invalid project file");
  await saveProject(project);
  return project;
}

export async function readSpreadsheetFile(file: File): Promise<string[][]> {
  const XLSX = await import("xlsx");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "txt" || ext === "csv") {
    const text = await file.text();
    const delimiter = ext === "csv" ? ";" : "\t";
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => line.split(delimiter).map((c) => c.trim()));
  }
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
}
