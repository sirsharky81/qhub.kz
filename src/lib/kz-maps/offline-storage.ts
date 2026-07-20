import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import type { KzMapRegionBundle, KzPlace } from "./types";

const META_KEY = "qhub_kz_maps_offline_meta";
const PLACES_PREFIX = "qhub_kz_maps_places_";

export interface OfflineRegionMeta {
  id: string;
  name: string;
  downloadedAt: number;
  placesCount: number;
  pmtilesReady: boolean;
  pmtilesLocalUrl?: string;
  pmtilesBytes?: number;
}

export interface DownloadProgress {
  regionId: string;
  phase: "places" | "pmtiles" | "done" | "error";
  percent: number;
  message: string;
}

function readMeta(): OfflineRegionMeta[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineRegionMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMeta(list: OfflineRegionMeta[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(META_KEY, JSON.stringify(list));
}

export function listOfflineRegions(): OfflineRegionMeta[] {
  return readMeta().sort((a, b) => b.downloadedAt - a.downloadedAt);
}

export interface OfflineStorageSummary {
  regionCount: number;
  placesCount: number;
  pmtilesReadyCount: number;
  estimatedBytes: number;
}

export function getOfflineStorageSummary(): OfflineStorageSummary {
  const regions = listOfflineRegions();
  return {
    regionCount: regions.length,
    placesCount: regions.reduce((sum, r) => sum + r.placesCount, 0),
    pmtilesReadyCount: regions.filter((r) => r.pmtilesReady).length,
    estimatedBytes: regions.reduce((sum, r) => sum + (r.pmtilesBytes ?? 0), 0),
  };
}

function revokePmtilesLocalUrl(url: string | undefined): void {
  if (!url || typeof URL === "undefined") return;
  if (url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

export function getOfflineRegion(id: string): OfflineRegionMeta | null {
  return readMeta().find((r) => r.id === id) ?? null;
}

export function getCachedPlaces(regionId: string): KzPlace[] | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${PLACES_PREFIX}${regionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KzPlace[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getAllCachedPlaces(): KzPlace[] {
  const seen = new Set<string>();
  const out: KzPlace[] = [];
  for (const meta of listOfflineRegions()) {
    const places = getCachedPlaces(meta.id);
    if (!places) continue;
    for (const p of places) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function cachePlaces(regionId: string, places: KzPlace[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(`${PLACES_PREFIX}${regionId}`, JSON.stringify(places));
}

function upsertMeta(entry: OfflineRegionMeta): void {
  const all = readMeta().filter((r) => r.id !== entry.id);
  all.push(entry);
  writeMeta(all);
}

async function downloadPmtilesNative(
  regionId: string,
  url: string,
  onProgress: (percent: number) => void,
): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const dir = "kz-maps/regions";
  const path = `${dir}/${regionId}.pmtiles`;

  try {
    await Filesystem.mkdir({ path: dir, directory: Directory.Data, recursive: true });
  } catch {
    /* exists */
  }

  onProgress(10);

  const result = await Filesystem.downloadFile({
    url,
    path,
    directory: Directory.Data,
  });

  onProgress(90);

  if (result.path) {
    const uri = await Filesystem.getUri({ path, directory: Directory.Data });
    return Capacitor.convertFileSrc(uri.uri);
  }
  return null;
}

async function downloadPmtilesBrowser(
  regionId: string,
  url: string,
  onProgress: (percent: number) => void,
): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      const data = (await res.json()) as { error?: string; message?: string };
      if (data.error === "pmtiles_cli_missing") {
        throw new Error(
          "Сервис подготовки офлайн-карт временно недоступен. Попробуйте через несколько минут.",
        );
      }
      throw new Error(data.message ?? `Ошибка загрузки карты (${res.status})`);
    }
    return null;
  }

  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) onProgress(Math.min(95, Math.round((received / total) * 100)));
  }

  const blob = new Blob(chunks as BlobPart[], { type: "application/octet-stream" });
  const blobUrl = URL.createObjectURL(blob);

  if (typeof indexedDB !== "undefined") {
    try {
      const db = await openBlobDb();
      await putBlob(db, regionId, blob);
    } catch {
      /* IndexedDB optional */
    }
  }

  return blobUrl;
}

function openBlobDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("qhub_kz_maps_offline", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("pmtiles");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function putBlob(db: IDBDatabase, key: string, blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pmtiles", "readwrite");
    tx.objectStore("pmtiles").put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflinePmtilesUrl(regionId: string): Promise<string | null> {
  const meta = getOfflineRegion(regionId);
  if (meta?.pmtilesLocalUrl) return meta.pmtilesLocalUrl;

  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openBlobDb();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const req = db.transaction("pmtiles", "readonly").objectStore("pmtiles").get(regionId);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    if (blob) return URL.createObjectURL(blob);
  } catch {
    /* ignore */
  }
  return null;
}

export async function downloadRegionBundle(
  bundle: Pick<
    KzMapRegionBundle,
    "id" | "name" | "placesBundleUrl" | "pmtilesUrl" | "pmtilesBytes"
  >,
  onProgress: (p: DownloadProgress) => void,
): Promise<void> {
  onProgress({ regionId: bundle.id, phase: "places", percent: 0, message: "Загрузка мест…" });

  const placesUrl =
    bundle.placesBundleUrl ?? `/api/kz-maps/bundles/${encodeURIComponent(bundle.id)}/places`;
  const placesRes = await fetch(placesUrl);
  if (!placesRes.ok) throw new Error("Не удалось загрузить места региона");
  const placesData = (await placesRes.json()) as { places?: KzPlace[] };
  const places = placesData.places ?? [];
  cachePlaces(bundle.id, places);

  onProgress({ regionId: bundle.id, phase: "places", percent: 100, message: "Места сохранены" });

  let pmtilesLocalUrl: string | undefined;
  let pmtilesReady = false;

  if (bundle.pmtilesUrl) {
    onProgress({ regionId: bundle.id, phase: "pmtiles", percent: 0, message: "Загрузка карты…" });
    try {
      const localUrl = Capacitor.isNativePlatform()
        ? await downloadPmtilesNative(bundle.id, bundle.pmtilesUrl, (pct) =>
            onProgress({
              regionId: bundle.id,
              phase: "pmtiles",
              percent: pct,
              message: "Загрузка карты…",
            }),
          )
        : await downloadPmtilesBrowser(bundle.id, bundle.pmtilesUrl, (pct) =>
            onProgress({
              regionId: bundle.id,
              phase: "pmtiles",
              percent: pct,
              message: "Загрузка карты…",
            }),
          );

      if (localUrl) {
        pmtilesLocalUrl = localUrl;
        pmtilesReady = true;
      }
    } catch (e) {
      throw e instanceof Error ? e : new Error("Не удалось загрузить карту региона");
    }
  }

  upsertMeta({
    id: bundle.id,
    name: bundle.name,
    downloadedAt: Date.now(),
    placesCount: places.length,
    pmtilesReady,
    pmtilesLocalUrl,
    pmtilesBytes: bundle.pmtilesBytes,
  });

  onProgress({
    regionId: bundle.id,
    phase: "done",
    percent: 100,
    message: pmtilesReady
      ? "Регион готов к офлайн-использованию"
      : "Места сохранены. Карта не загрузилась — проверьте pmtiles CLI на сервере или повторите позже.",
  });
}

export async function deleteOfflineRegion(id: string): Promise<void> {
  const existing = getOfflineRegion(id);
  revokePmtilesLocalUrl(existing?.pmtilesLocalUrl);

  writeMeta(readMeta().filter((r) => r.id !== id));
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(`${PLACES_PREFIX}${id}`);
  }

  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.deleteFile({
        path: `kz-maps/regions/${id}.pmtiles`,
        directory: Directory.Data,
      });
    } catch {
      /* ignore */
    }
  }

  if (typeof indexedDB !== "undefined") {
    try {
      const db = await openBlobDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("pmtiles", "readwrite");
        tx.objectStore("pmtiles").delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      /* ignore */
    }
  }
}

export async function deleteAllOfflineRegions(): Promise<void> {
  const ids = listOfflineRegions().map((r) => r.id);
  for (const id of ids) {
    await deleteOfflineRegion(id);
  }
}
