import { mapYtdlpError, parseUrlBody } from "@/lib/audio-extractor/api-helpers";
import { resolveYoutubeOnServer } from "@/lib/audio-extractor/youtube-resolve-server";
import { YoutubeResolveError } from "@/lib/audio-extractor/youtube-resolve";

export const maxDuration = 30;

/** Same-origin resolve for client mode (avoids CORS; falls back to yt-dlp on localhost). */
export async function POST(request: Request) {
  try {
    const parsed = await parseUrlBody(request);
    if (parsed instanceof Response) return parsed;

    const result = await resolveYoutubeOnServer(parsed.url);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof YoutubeResolveError) {
      return mapYtdlpError(err);
    }
    return mapYtdlpError(err);
  }
}
