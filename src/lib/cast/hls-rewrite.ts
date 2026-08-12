import { signCastStreamToken } from "./proxy-token";
import type { CastStreamTokenPayload } from "./types";

export function rewriteHlsPlaylist(
  playlistText: string,
  baseUrl: string,
  signSegment: (absoluteUrl: string, contentType: string) => Promise<string>,
): Promise<string> {
  return rewriteHlsPlaylistAsync(playlistText, baseUrl, signSegment);
}

async function rewriteHlsPlaylistAsync(
  playlistText: string,
  baseUrl: string,
  signSegment: (absoluteUrl: string, contentType: string) => Promise<string>,
): Promise<string> {
  const lines = playlistText.split(/\r?\n/);
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }

    let absolute: string;
    try {
      absolute = new URL(trimmed, baseUrl).href;
    } catch {
      out.push(line);
      continue;
    }

    const lower = absolute.split("?")[0]?.toLowerCase() ?? "";
    const isPlaylist = lower.endsWith(".m3u8");
    const contentType = isPlaylist ? "application/x-mpegURL" : "video/mp2t";
    const proxyUrl = await signSegment(absolute, contentType);
    out.push(proxyUrl);
  }

  return out.join("\n");
}

export async function signUrlSegmentToken(
  absoluteUrl: string,
  contentType: string,
  referer?: string,
): Promise<string> {
  return signCastStreamToken({
    upstreamKind: "url",
    upstreamRef: absoluteUrl,
    contentType,
    referer,
  });
}

export function isHlsPlaylistContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct.includes("mpegurl") ||
    ct.includes("vnd.apple.mpegurl") ||
    ct === "application/x-mpegurl"
  );
}

export function isHlsPlaylistBody(text: string): boolean {
  return text.includes("#EXTM3U");
}

export type CastStreamTokenSigner = (
  payload: Omit<CastStreamTokenPayload, "exp" | "streamId">,
) => Promise<string>;
