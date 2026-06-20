/**
 * YouTube extraction mode.
 * - `client` (default): metadata + audio via browser (user IP, Piped/Invidious).
 * - `server`: legacy Vercel yt-dlp + server fallbacks (`/api/audio-extractor/*`).
 *
 * Revert to server: set NEXT_PUBLIC_AUDIO_EXTRACTOR_YOUTUBE_MODE=server
 */
export type YoutubeExtractionMode = "client" | "server";

export function getYoutubeExtractionMode(): YoutubeExtractionMode {
  const raw = process.env.NEXT_PUBLIC_AUDIO_EXTRACTOR_YOUTUBE_MODE?.trim().toLowerCase();
  return raw === "server" ? "server" : "client";
}

export function isClientYoutubeExtraction(): boolean {
  return getYoutubeExtractionMode() === "client";
}
