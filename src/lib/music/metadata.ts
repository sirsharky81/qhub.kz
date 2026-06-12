import { parseFileName } from "./types";

export interface ParsedMetadata {
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: number;
  coverBlob: Blob | null;
}

function normalizeImageMime(format: string | undefined): string {
  if (!format) return "image/jpeg";
  if (format.startsWith("image/")) return format;
  const ext = format.toLowerCase();
  if (ext === "jpeg" || ext === "jpg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export async function extractMetadata(file: File): Promise<ParsedMetadata> {
  const fallback = parseFileName(file.name);

  try {
    const { parseBlob } = await import("music-metadata");
    const metadata = await parseBlob(file, { skipCovers: false });

    let coverBlob: Blob | null = null;
    const picture = metadata.common.picture?.[0];
    if (picture?.data && picture.data.byteLength > 0) {
      const bytes = new Uint8Array(picture.data);
      coverBlob = new Blob([bytes], {
        type: normalizeImageMime(picture.format),
      });
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
      coverBlob,
    };
  } catch {
    return {
      title: fallback.title,
      artist: fallback.artist,
      album: "Без альбома",
      genre: "",
      duration: 0,
      coverBlob: null,
    };
  }
}

export function revokeCoverUrl(url: string | null): void {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}
