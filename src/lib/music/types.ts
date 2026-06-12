export const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".m4a",
  ".aac",
  ".wav",
  ".flac",
  ".ogg",
]);

export const AUDIO_MIME_PREFIXES = ["audio/"];

export type RepeatMode = "none" | "one" | "all";

export type LibraryTab = "tracks" | "albums" | "artists" | "favorites" | "folders";

export type UnavailableFilter = "hide" | "show" | "only";

export type SortField = "title" | "artist" | "album" | "duration" | "addedAt";
export type SortDirection = "asc" | "desc";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: number;
  coverArtUrl: string | null;
  fileName: string;
  mimeType: string;
  addedAt: number;
  /** true when blob is stored in IndexedDB */
  hasBlob: boolean;
  /** true when FileSystemFileHandle is stored */
  hasHandle: boolean;
  /** relative folder path from directory import */
  folderPath?: string;
  /** true when cover art blob is stored in IndexedDB */
  hasCover?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}

export interface PlayerSettings {
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export interface PlaybackState {
  queue: string[];
  queueIndex: number;
  lastTrackId: string | null;
  lastPosition: number;
  favoriteTrackIds: string[];
  settings: PlayerSettings;
}

export interface TrackBlobRecord {
  trackId: string;
  blob: Blob;
}

export interface TrackHandleRecord {
  trackId: string;
  handle: FileSystemFileHandle;
}

export interface TrackCoverRecord {
  trackId: string;
  blob: Blob;
}

export interface ImportProgress {
  total: number;
  processed: number;
  currentFile: string;
}

export function isAudioFile(file: File): boolean {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (AUDIO_EXTENSIONS.has(ext)) return true;
  return AUDIO_MIME_PREFIXES.some((p) => file.type.startsWith(p));
}

export function parseFileName(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^.]+$/, "");
  const parts = base.split(" - ");
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  }
  return { artist: "Неизвестный исполнитель", title: base.trim() || "Без названия" };
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
