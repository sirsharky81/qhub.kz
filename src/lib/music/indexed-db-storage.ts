import type {
  PlaybackState,
  PlayerSettings,
  Playlist,
  Track,
  TrackBlobRecord,
  TrackCoverRecord,
  TrackHandleRecord,
} from "./types";

const DB_NAME = "qhub-music";
const DB_VERSION = 2;

const STORES = {
  tracks: "tracks",
  blobs: "blobs",
  handles: "handles",
  covers: "covers",
  playlists: "playlists",
  state: "state",
} as const;

const DEFAULT_SETTINGS: PlayerSettings = {
  volume: 0.85,
  shuffle: false,
  repeat: "none",
};

const DEFAULT_STATE: PlaybackState = {
  queue: [],
  queueIndex: -1,
  lastTrackId: null,
  lastPosition: 0,
  favoriteTrackIds: [],
  settings: DEFAULT_SETTINGS,
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.tracks)) {
        db.createObjectStore(STORES.tracks, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.blobs)) {
        db.createObjectStore(STORES.blobs, { keyPath: "trackId" });
      }
      if (!db.objectStoreNames.contains(STORES.handles)) {
        db.createObjectStore(STORES.handles, { keyPath: "trackId" });
      }
      if (!db.objectStoreNames.contains(STORES.covers)) {
        db.createObjectStore(STORES.covers, { keyPath: "trackId" });
      }
      if (!db.objectStoreNames.contains(STORES.playlists)) {
        db.createObjectStore(STORES.playlists, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.state)) {
        db.createObjectStore(STORES.state, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = fn(store);
        transaction.oncomplete = () => {
          if (request && "result" in request) {
            resolve((request as IDBRequest<T>).result);
          } else {
            resolve();
          }
        };
        transaction.onerror = () => reject(transaction.error);
      }),
  );
}

function txMulti<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  fn: (stores: Record<string, IDBObjectStore>) => T | Promise<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        const stores: Record<string, IDBObjectStore> = {};
        for (const name of storeNames) {
          stores[name] = transaction.objectStore(name);
        }
        Promise.resolve(fn(stores))
          .then(resolve)
          .catch(reject);
        transaction.onerror = () => reject(transaction.error);
      }),
  );
}

export async function getAllTracks(): Promise<Track[]> {
  const tracks = await tx<Track[]>(STORES.tracks, "readonly", (store) => store.getAll());
  return (tracks ?? []).sort((a, b) => a.addedAt - b.addedAt);
}

export async function getTrack(id: string): Promise<Track | undefined> {
  return (await tx<Track>(STORES.tracks, "readonly", (store) => store.get(id))) ?? undefined;
}

export async function saveTrack(track: Track): Promise<void> {
  const persisted: Track = { ...track, coverArtUrl: null };
  await tx(STORES.tracks, "readwrite", (store) => store.put(persisted));
}

export async function saveTracks(tracks: Track[]): Promise<void> {
  await txMulti([STORES.tracks], "readwrite", (stores) => {
    for (const track of tracks) {
      stores[STORES.tracks].put(track);
    }
  });
}

export async function deleteTrack(id: string): Promise<void> {
  await txMulti(
    [STORES.tracks, STORES.blobs, STORES.handles, STORES.covers],
    "readwrite",
    (stores) => {
      stores[STORES.tracks].delete(id);
      stores[STORES.blobs].delete(id);
      stores[STORES.handles].delete(id);
      stores[STORES.covers].delete(id);
    },
  );
}

export async function saveBlob(record: TrackBlobRecord): Promise<void> {
  await tx(STORES.blobs, "readwrite", (store) => store.put(record));
}

export async function getBlob(trackId: string): Promise<Blob | null> {
  const record = await tx<TrackBlobRecord>(STORES.blobs, "readonly", (store) =>
    store.get(trackId),
  );
  return record?.blob ?? null;
}

export async function saveHandle(record: TrackHandleRecord): Promise<void> {
  await tx(STORES.handles, "readwrite", (store) => store.put(record));
}

export async function getHandle(trackId: string): Promise<FileSystemFileHandle | null> {
  const record = await tx<TrackHandleRecord>(STORES.handles, "readonly", (store) =>
    store.get(trackId),
  );
  return record?.handle ?? null;
}

export async function saveCover(record: TrackCoverRecord): Promise<void> {
  await tx(STORES.covers, "readwrite", (store) => store.put(record));
}

export async function getCover(trackId: string): Promise<Blob | null> {
  const record = await tx<TrackCoverRecord>(STORES.covers, "readonly", (store) =>
    store.get(trackId),
  );
  return record?.blob ?? null;
}

export async function getPlaybackState(): Promise<PlaybackState> {
  const record = await tx<{ key: string; value: PlaybackState }>(STORES.state, "readonly", (store) =>
    store.get("playback"),
  );
  if (!record?.value) return { ...DEFAULT_STATE, settings: { ...DEFAULT_SETTINGS } };
  return {
    ...DEFAULT_STATE,
    ...record.value,
    settings: { ...DEFAULT_SETTINGS, ...record.value.settings },
  };
}

export async function savePlaybackState(state: PlaybackState): Promise<void> {
  await tx(STORES.state, "readwrite", (store) =>
    store.put({ key: "playback", value: state }),
  );
}

export async function getPlaylists(): Promise<Playlist[]> {
  const list = await tx<Playlist[]>(STORES.playlists, "readonly", (store) => store.getAll());
  return list ?? [];
}

export async function savePlaylist(playlist: Playlist): Promise<void> {
  await tx(STORES.playlists, "readwrite", (store) => store.put(playlist));
}

export async function deletePlaylist(id: string): Promise<void> {
  await tx(STORES.playlists, "readwrite", (store) => store.delete(id));
}

export async function clearLibrary(): Promise<void> {
  await txMulti(
    [STORES.tracks, STORES.blobs, STORES.handles, STORES.covers, STORES.playlists],
    "readwrite",
    (stores) => {
      for (const name of [
        STORES.tracks,
        STORES.blobs,
        STORES.handles,
        STORES.covers,
        STORES.playlists,
      ]) {
        stores[name].clear();
      }
    },
  );
}
