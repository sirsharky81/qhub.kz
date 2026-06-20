import { fetchVideoMetadataYtdlp } from "./ytdlp";
import type { VideoMetadata } from "./types";
import { extractYoutubeVideoId } from "./youtube-id";
import { resolveYoutubeVideo, YoutubeResolveError } from "./youtube-resolve";

export interface YoutubeServerResolve {
  metadata: VideoMetadata;
  audioUrl: string | null;
  mimeType: string | null;
  source: "piped" | "ytdlp";
}

/** Server-side resolve: Piped/Invidious → yt-dlp metadata only. */
export async function resolveYoutubeOnServer(url: string): Promise<YoutubeServerResolve> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) throw new YoutubeResolveError("Некорректная ссылка YouTube", "invalid");

  try {
    const resolved = await resolveYoutubeVideo(videoId);
    return {
      metadata: resolved.metadata,
      audioUrl: resolved.audioUrl,
      mimeType: resolved.mimeType,
      source: "piped",
    };
  } catch (err) {
    if (err instanceof YoutubeResolveError && err.code === "too_long") throw err;
  }

  const metadata = await fetchVideoMetadataYtdlp(url);
  return {
    metadata,
    audioUrl: null,
    mimeType: null,
    source: "ytdlp",
  };
}
