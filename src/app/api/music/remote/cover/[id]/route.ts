import { jsonAuthError } from "@/lib/messenger/guard";
import { assertMusicRemoteAccess } from "@/lib/music/music-access";
import { isMusicRemoteConfigured } from "@/lib/music/navidrome-config";
import { navidromeMediaUrl } from "@/lib/music/navidrome-client";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertMusicRemoteAccess();
    if (!isMusicRemoteConfigured()) {
      return Response.json({ error: "Библиотека NAS не настроена" }, { status: 503 });
    }

    const { id } = await context.params;
    const upstreamUrl = navidromeMediaUrl("cover", decodeURIComponent(id), { size: "300" });
    const upstream = await fetch(upstreamUrl, { cache: "force-cache" });

    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    headers.set("cache-control", "private, max-age=86400");

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}
