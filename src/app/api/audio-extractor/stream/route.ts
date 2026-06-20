import { spawnAudioStream, fetchVideoMetadata } from "@/lib/audio-extractor/ytdlp";
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
    const { stream, contentType, abort } = spawnAudioStream(parsed.url);

    const wrapped = new ReadableStream({
      start(controller) {
        const reader = stream.getReader();
        const pump = (): void => {
          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                controller.close();
                return;
              }
              if (value) controller.enqueue(value);
              pump();
            })
            .catch((err) => {
              controller.error(err);
              abort();
            });
        };
        pump();
      },
      cancel() {
        abort();
      },
    });

    const safeTitle = metadata.title
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .slice(0, 80);

    return new Response(wrapped, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${encodeURIComponent(safeTitle)}.m4a"`,
        "X-Audio-Duration": String(metadata.duration),
        "X-Audio-Platform": metadata.platform,
      },
    });
  } catch (err) {
    return mapYtdlpError(err);
  }
}
