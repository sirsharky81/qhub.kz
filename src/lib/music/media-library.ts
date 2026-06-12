import * as storage from "./indexed-db-storage";
import { extractMetadata } from "./metadata";
import type { ImportProgress, SortDirection, SortField, Track } from "./types";
import { isAudioFile } from "./types";

function generateId(): string {
  return crypto.randomUUID();
}

async function buildTrackFromFile(
  file: File,
  handle?: FileSystemFileHandle,
  folderPath?: string,
): Promise<Track> {
  const meta = await extractMetadata(file);
  const id = generateId();

  let coverArtUrl: string | null = null;
  let hasCover = false;
  if (meta.coverBlob) {
    await storage.saveCover({ trackId: id, blob: meta.coverBlob });
    coverArtUrl = getOrCreateCoverUrl(id, meta.coverBlob);
    hasCover = true;
  }

  const track: Track = {
    id,
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    genre: meta.genre,
    duration: meta.duration,
    coverArtUrl,
    fileName: file.name,
    mimeType: file.type || "audio/mpeg",
    addedAt: Date.now(),
    hasBlob: !handle,
    hasHandle: !!handle,
    folderPath: folderPath || undefined,
    hasCover,
  };

  await storage.saveTrack(track);

  if (handle) {
    await storage.saveHandle({ trackId: id, handle });
  } else {
    await storage.saveBlob({ trackId: id, blob: file });
  }

  return track;
}

export async function importFiles(
  files: File[],
  onProgress?: (progress: ImportProgress) => void,
): Promise<Track[]> {
  const audioFiles = files.filter(isAudioFile);
  const imported: Track[] = [];

  for (let i = 0; i < audioFiles.length; i++) {
    const file = audioFiles[i];
    onProgress?.({
      total: audioFiles.length,
      processed: i,
      currentFile: file.name,
    });
    const track = await buildTrackFromFile(file);
    imported.push(track);
  }

  onProgress?.({
    total: audioFiles.length,
    processed: audioFiles.length,
    currentFile: "",
  });

  return imported;
}

async function collectHandlesFromDirectory(
  dirHandle: FileSystemDirectoryHandle,
  results: { handle: FileSystemFileHandle; file: File; folderPath: string }[],
  basePath = "",
): Promise<void> {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === "file") {
      const handle = entry as FileSystemFileHandle;
      const file = await handle.getFile();
      if (isAudioFile(file)) results.push({ handle, file, folderPath: basePath || "/" });
    } else if (entry.kind === "directory") {
      const subPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      await collectHandlesFromDirectory(entry as FileSystemDirectoryHandle, results, subPath);
    }
  }
}

export async function importDirectory(
  dirHandle: FileSystemDirectoryHandle,
  onProgress?: (progress: ImportProgress) => void,
): Promise<Track[]> {
  const entries: { handle: FileSystemFileHandle; file: File; folderPath: string }[] = [];
  await collectHandlesFromDirectory(dirHandle, entries);

  const imported: Track[] = [];
  for (let i = 0; i < entries.length; i++) {
    const { handle, file, folderPath } = entries[i];
    onProgress?.({
      total: entries.length,
      processed: i,
      currentFile: file.name,
    });
    const track = await buildTrackFromFile(file, handle, folderPath);
    imported.push(track);
  }

  onProgress?.({
    total: entries.length,
    processed: entries.length,
    currentFile: "",
  });

  return imported;
}

const fileCache = new Map<string, File>();
const objectUrlCache = new Map<string, string>();
const coverUrlCache = new Map<string, string>();

export function getOrCreateCoverUrl(trackId: string, blob: Blob): string {
  const cached = coverUrlCache.get(trackId);
  if (cached) return cached;
  const url = URL.createObjectURL(blob);
  coverUrlCache.set(trackId, url);
  return url;
}

export function releaseCoverUrl(trackId: string): void {
  const url = coverUrlCache.get(trackId);
  if (!url) return;
  URL.revokeObjectURL(url);
  coverUrlCache.delete(trackId);
}

async function hydrateTrackCover(track: Track): Promise<Track> {
  if (track.coverArtUrl && coverUrlCache.has(track.id)) {
    return track;
  }

  if (track.hasCover) {
    const blob = await storage.getCover(track.id);
    if (blob) {
      return { ...track, coverArtUrl: getOrCreateCoverUrl(track.id, blob) };
    }
    return { ...track, coverArtUrl: null, hasCover: false };
  }

  // Legacy tracks imported before cover persistence — re-extract from audio file
  const file = await getTrackFile(track);
  if (!file) {
    return { ...track, coverArtUrl: null };
  }

  const meta = await extractMetadata(file);
  if (!meta.coverBlob) {
    return { ...track, coverArtUrl: null, hasCover: false };
  }

  await storage.saveCover({ trackId: track.id, blob: meta.coverBlob });
  const hydrated = {
    ...track,
    hasCover: true,
    coverArtUrl: getOrCreateCoverUrl(track.id, meta.coverBlob),
  };
  await storage.saveTrack(hydrated);
  return hydrated;
}

export function cacheTrackFile(trackId: string, file: File): void {
  fileCache.set(trackId, file);
}

export function getCachedTrackFile(trackId: string): File | undefined {
  return fileCache.get(trackId);
}

export function getOrCreateObjectUrl(trackId: string, file: File): string {
  const cached = objectUrlCache.get(trackId);
  if (cached) return cached;
  const url = URL.createObjectURL(file);
  objectUrlCache.set(trackId, url);
  return url;
}

export function releaseObjectUrl(trackId: string): void {
  const url = objectUrlCache.get(trackId);
  if (!url) return;
  URL.revokeObjectURL(url);
  objectUrlCache.delete(trackId);
}

export async function getTrackFile(track: Track): Promise<File | null> {
  const cached = fileCache.get(track.id);
  if (cached) return cached;

  const handle = track.hasHandle ? await storage.getHandle(track.id) : null;
  if (handle) {
    try {
      const perm = await handle.queryPermission({ mode: "read" });
      if (perm !== "granted") {
        const req = await handle.requestPermission({ mode: "read" });
        if (req !== "granted") return null;
      }
      const file = await handle.getFile();
      fileCache.set(track.id, file);
      return file;
    } catch {
      return null;
    }
  }

  const blob = track.hasBlob ? await storage.getBlob(track.id) : null;
  if (blob) {
    const file = new File([blob], track.fileName, { type: track.mimeType });
    fileCache.set(track.id, file);
    return file;
  }

  return null;
}

export async function prefetchTrackFiles(trackIds: string[]): Promise<void> {
  await Promise.all(
    trackIds.map(async (id) => {
      if (fileCache.has(id)) {
        const file = fileCache.get(id)!;
        getOrCreateObjectUrl(id, file);
        return;
      }
      const track = await storage.getTrack(id);
      if (!track) return;
      const file = await getTrackFile(track);
      if (file) getOrCreateObjectUrl(id, file);
    }),
  );
}

export function sortTracks(
  tracks: Track[],
  field: SortField,
  direction: SortDirection,
): Track[] {
  const sorted = [...tracks].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "title":
        cmp = a.title.localeCompare(b.title, "ru");
        break;
      case "artist":
        cmp = a.artist.localeCompare(b.artist, "ru");
        break;
      case "album":
        cmp = a.album.localeCompare(b.album, "ru");
        break;
      case "duration":
        cmp = a.duration - b.duration;
        break;
      case "addedAt":
        cmp = a.addedAt - b.addedAt;
        break;
    }
    return direction === "asc" ? cmp : -cmp;
  });
  return sorted;
}

export function filterTracks(tracks: Track[], query: string): Track[] {
  const q = query.trim().toLowerCase();
  if (!q) return tracks;
  return tracks.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q) ||
      t.genre.toLowerCase().includes(q) ||
      t.fileName.toLowerCase().includes(q),
  );
}

export interface AlbumGroup {
  album: string;
  artist: string;
  tracks: Track[];
  coverArtUrl: string | null;
}

export interface ArtistGroup {
  artist: string;
  tracks: Track[];
}

export interface FolderGroup {
  folderPath: string;
  tracks: Track[];
}

export function groupByFolder(tracks: Track[]): FolderGroup[] {
  const map = new Map<string, FolderGroup>();
  for (const track of tracks) {
    const path = track.folderPath || "/";
    const existing = map.get(path);
    if (existing) {
      existing.tracks.push(track);
    } else {
      map.set(path, { folderPath: path, tracks: [track] });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.folderPath.localeCompare(b.folderPath, "ru"));
}

export async function isTrackFileAvailable(track: Track): Promise<boolean> {
  if (fileCache.has(track.id)) return true;
  const file = await getTrackFile(track);
  return file !== null;
}

export async function scanUnavailableTracks(tracks: Track[]): Promise<Set<string>> {
  const unavailable = new Set<string>();
  await Promise.all(
    tracks.map(async (track) => {
      const ok = await isTrackFileAvailable(track);
      if (!ok) unavailable.add(track.id);
    }),
  );
  return unavailable;
}

export function groupByAlbum(tracks: Track[]): AlbumGroup[] {
  const map = new Map<string, AlbumGroup>();
  for (const track of tracks) {
    const key = `${track.artist}::${track.album}`;
    const existing = map.get(key);
    if (existing) {
      existing.tracks.push(track);
      if (!existing.coverArtUrl && track.coverArtUrl) {
        existing.coverArtUrl = track.coverArtUrl;
      }
    } else {
      map.set(key, {
        album: track.album,
        artist: track.artist,
        tracks: [track],
        coverArtUrl: track.coverArtUrl,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.album.localeCompare(b.album, "ru"));
}

export function groupByArtist(tracks: Track[]): ArtistGroup[] {
  const map = new Map<string, ArtistGroup>();
  for (const track of tracks) {
    const existing = map.get(track.artist);
    if (existing) {
      existing.tracks.push(track);
    } else {
      map.set(track.artist, { artist: track.artist, tracks: [track] });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.artist.localeCompare(b.artist, "ru"));
}

export async function loadLibrary(): Promise<Track[]> {
  const tracks = await storage.getAllTracks();
  const hydrated = await Promise.all(tracks.map((track) => hydrateTrackCover(track)));
  return hydrated.sort((a, b) => a.addedAt - b.addedAt);
}

export async function deleteTrack(id: string): Promise<void> {
  releaseCoverUrl(id);
  await storage.deleteTrack(id);
}

export async function clearLibrary(): Promise<void> {
  for (const trackId of coverUrlCache.keys()) {
    releaseCoverUrl(trackId);
  }
  await storage.clearLibrary();
}
