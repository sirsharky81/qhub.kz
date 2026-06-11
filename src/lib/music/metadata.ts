import { parseFileName } from "./types";

export interface ParsedMetadata {
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: number;
  coverArtUrl: string | null;
}

function revokeCoverUrl(url: string | null): void {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export async function extractMetadata(file: File): Promise<ParsedMetadata> {
  const fallback = parseFileName(file.name);

  try {
    const { parseBlob } = await import("music-metadata");
    const metadata = await parseBlob(file, { skipCovers: false });

    let coverArtUrl: string | null = null;
    const picture = metadata.common.picture?.[0];
    if (picture?.data) {
      const blob = new Blob([Uint8Array.from(picture.data)], {
        type: picture.format ?? "image/jpeg",
      });
      coverArtUrl = URL.createObjectURL(blob);
    }

    return {
      title: metadata.common.title?.trim() || fallback.title,
      artist:
        metadata.common.artist?.trim() ||
        metadata.common.albumartist?.trim() ||
        fallback.artist,
      album: metadata.common.album?.trim() || "Без альбома",
      genre: metadata.common.genre?.[0]?.trim() || "",
      duration: metadata.format.duration ?? 0,
      coverArtUrl,
    };
  } catch {
    return {
      title: fallback.title,
      artist: fallback.artist,
      album: "Без альбома",
      genre: "",
      duration: 0,
      coverArtUrl: null,
    };
  }
}

export { revokeCoverUrl };
