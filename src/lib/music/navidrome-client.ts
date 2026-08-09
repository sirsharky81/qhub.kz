import { createHash, randomBytes } from "node:crypto";
import { getNavidromeConfig } from "./navidrome-config";

const API_VERSION = "1.16.1";
const CLIENT_NAME = "qhub";

type SubsonicEnvelope = {
  "subsonic-response": {
    status: "ok" | "failed";
    error?: { code: number; message: string };
    artists?: {
      index?: Array<{
        name?: string;
        artist?: Array<{ id: string; name: string; albumCount?: number; coverArt?: string }>;
      }>;
    };
    artist?: {
      id: string;
      name: string;
      album?: Array<{
        id: string;
        name: string;
        artist?: string;
        songCount?: number;
        coverArt?: string;
        year?: number;
      }>;
    };
    album?: {
      id: string;
      name: string;
      artist?: string;
      coverArt?: string;
      song?: Array<{
        id: string;
        title?: string;
        artist?: string;
        album?: string;
        duration?: number;
        contentType?: string;
        suffix?: string;
        coverArt?: string;
        track?: number;
        path?: string;
      }>;
    };
    searchResult3?: {
      artist?: Array<{ id: string; name: string; albumCount?: number }>;
      album?: Array<{ id: string; name: string; artist?: string; coverArt?: string }>;
      song?: Array<{
        id: string;
        title?: string;
        artist?: string;
        album?: string;
        duration?: number;
        contentType?: string;
        coverArt?: string;
      }>;
    };
  };
};

function authParams(user: string, pass: string): Record<string, string> {
  const salt = randomBytes(6).toString("hex");
  const token = createHash("md5").update(pass + salt).digest("hex");
  return {
    u: user,
    t: token,
    s: salt,
    v: API_VERSION,
    c: CLIENT_NAME,
    f: "json",
  };
}

function buildUrl(path: string, extra: Record<string, string> = {}): string {
  const { baseUrl, user, pass } = getNavidromeConfig();
  const url = new URL(`${baseUrl}${path}`);
  const params = { ...authParams(user, pass), ...extra };
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function subsonicGet(path: string, extra: Record<string, string> = {}): Promise<SubsonicEnvelope["subsonic-response"]> {
  const url = buildUrl(path, extra);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Navidrome HTTP ${res.status}`);
  }
  const data = (await res.json()) as SubsonicEnvelope;
  const body = data["subsonic-response"];
  if (!body || body.status !== "ok") {
    throw new Error(body?.error?.message ?? "Navidrome error");
  }
  return body;
}

export async function navidromePing(): Promise<boolean> {
  await subsonicGet("/rest/ping.view");
  return true;
}

export type RemoteArtist = { id: string; name: string; albumCount: number };
export type RemoteAlbum = {
  id: string;
  name: string;
  artist: string;
  songCount: number;
  coverArt: string | null;
  year: number | null;
};
export type RemoteSong = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  mimeType: string;
  coverArt: string | null;
  fileName: string;
};

export async function navidromeGetArtists(): Promise<RemoteArtist[]> {
  const body = await subsonicGet("/rest/getArtists.view");
  const artists: RemoteArtist[] = [];
  for (const idx of body.artists?.index ?? []) {
    for (const a of idx.artist ?? []) {
      artists.push({
        id: a.id,
        name: a.name,
        albumCount: a.albumCount ?? 0,
      });
    }
  }
  artists.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return artists;
}

export async function navidromeGetArtist(id: string): Promise<{
  id: string;
  name: string;
  albums: RemoteAlbum[];
}> {
  const body = await subsonicGet("/rest/getArtist.view", { id });
  const artist = body.artist;
  if (!artist) throw new Error("Артист не найден");
  return {
    id: artist.id,
    name: artist.name,
    albums: (artist.album ?? []).map((al) => ({
      id: al.id,
      name: al.name,
      artist: al.artist ?? artist.name,
      songCount: al.songCount ?? 0,
      coverArt: al.coverArt ?? null,
      year: al.year ?? null,
    })),
  };
}

export async function navidromeGetAlbum(id: string): Promise<{
  id: string;
  name: string;
  artist: string;
  coverArt: string | null;
  songs: RemoteSong[];
}> {
  const body = await subsonicGet("/rest/getAlbum.view", { id });
  const album = body.album;
  if (!album) throw new Error("Альбом не найден");
  const songs = (album.song ?? []).map((s) => ({
    id: s.id,
    title: s.title ?? "Без названия",
    artist: s.artist ?? album.artist ?? "Неизвестный исполнитель",
    album: s.album ?? album.name,
    duration: s.duration ?? 0,
    mimeType: s.contentType ?? "audio/mpeg",
    coverArt: s.coverArt ?? album.coverArt ?? null,
    fileName: s.path?.split("/").pop() ?? `${s.title ?? s.id}.${s.suffix ?? "mp3"}`,
  }));
  return {
    id: album.id,
    name: album.name,
    artist: album.artist ?? "Неизвестный исполнитель",
    coverArt: album.coverArt ?? null,
    songs,
  };
}

export async function navidromeSearch(query: string): Promise<{
  artists: RemoteArtist[];
  albums: RemoteAlbum[];
  songs: RemoteSong[];
}> {
  const body = await subsonicGet("/rest/search3.view", {
    query,
    artistCount: "20",
    albumCount: "20",
    songCount: "40",
  });
  const result = body.searchResult3 ?? {};
  return {
    artists: (result.artist ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      albumCount: a.albumCount ?? 0,
    })),
    albums: (result.album ?? []).map((al) => ({
      id: al.id,
      name: al.name,
      artist: al.artist ?? "",
      songCount: 0,
      coverArt: al.coverArt ?? null,
      year: null,
    })),
    songs: (result.song ?? []).map((s) => ({
      id: s.id,
      title: s.title ?? "Без названия",
      artist: s.artist ?? "Неизвестный исполнитель",
      album: s.album ?? "",
      duration: s.duration ?? 0,
      mimeType: s.contentType ?? "audio/mpeg",
      coverArt: s.coverArt ?? null,
      fileName: `${s.title ?? s.id}.mp3`,
    })),
  };
}

/** Build authenticated upstream URL for stream/cover (credentials stay on server). */
export function navidromeMediaUrl(
  kind: "stream" | "cover",
  id: string,
  extra: Record<string, string> = {},
): string {
  const path = kind === "stream" ? "/rest/stream.view" : "/rest/getCoverArt.view";
  return buildUrl(path, { id, ...extra });
}

export function remoteSongToTrack(song: RemoteSong): import("./types").Track {
  return {
    id: `remote:${song.id}`,
    title: song.title,
    artist: song.artist,
    album: song.album,
    genre: "",
    duration: song.duration,
    coverArtUrl: song.coverArt ? `/api/music/remote/cover/${encodeURIComponent(song.coverArt)}` : null,
    fileName: song.fileName,
    mimeType: song.mimeType,
    addedAt: Date.now(),
    hasBlob: false,
    hasHandle: false,
    source: "remote",
    remoteId: song.id,
  };
}
