import { fetchVideoMetadata } from "@/lib/audio-extractor/ytdlp";
import { mapYtdlpError, parseUrlBody } from "@/lib/audio-extractor/api-helpers";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const parsed = await parseUrlBody(request);
    if (parsed instanceof Response) return parsed;

    const metadata = await fetchVideoMetadata(parsed.url);
    return Response.json(metadata, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return mapYtdlpError(err);
  }
}
