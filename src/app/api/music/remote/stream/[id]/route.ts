import { jsonAuthError } from "@/lib/messenger/guard";
import { assertMusicRemoteAccess } from "@/lib/music/music-access";
import { isMusicRemoteConfigured } from "@/lib/music/navidrome-config";
import { navidromeMediaUrl } from "@/lib/music/navidrome-client";

const FORWARD_REQ = ["range", "if-range"] as const;
const FORWARD_RES = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
] as const;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertMusicRemoteAccess();
    if (!isMusicRemoteConfigured()) {
      return Response.json({ error: "Библиотека NAS не настроена" }, { status: 503 });
    }

    const { id } = await context.params;
    const upstreamUrl = navidromeMediaUrl("stream", decodeURIComponent(id));

    const headers = new Headers();
    for (const name of FORWARD_REQ) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const upstream = await fetch(upstreamUrl, {
      headers,
      cache: "no-store",
    });

    const outHeaders = new Headers();
    for (const name of FORWARD_RES) {
      const value = upstream.headers.get(name);
      if (value) outHeaders.set(name, value);
    }
    if (!outHeaders.has("accept-ranges")) {
      outHeaders.set("accept-ranges", "bytes");
    }
    outHeaders.set("cache-control", "private, max-age=3600");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}
