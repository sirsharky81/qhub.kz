import { fetchVideoMetadata, streamAudio } from "@/lib/audio-extractor/ytdlp";
import {
  enforceRateLimit,
  mapYtdlpError,
  parseUrlBody,
} from "@/lib/audio-extractor/api-helpers";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const rateLimited = await enforceRateLimit(request);
    if (rateLimited) return rateLimited;

    const parsed = await parseUrlBody(request);
    if (parsed instanceof Response) return parsed;

    const metadata = await fetchVideoMetadata(parsed.url);
    const response = await streamAudio(parsed.url);

    const safeTitle = metadata.title
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .slice(0, 80);

    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(safeTitle)}.m4a"`);
    headers.set("X-Audio-Duration", String(metadata.duration));
    headers.set("X-Audio-Platform", metadata.platform);

    return new Response(response.body, { status: response.status, headers });
  } catch (err) {
    return mapYtdlpError(err);
  }
}
