import { NextResponse } from "next/server";
import { jsonAuthError } from "@/lib/messenger/guard";
import { assertMusicRemoteAccess } from "@/lib/music/music-access";
import { isMusicRemoteConfigured } from "@/lib/music/navidrome-config";
import {
  navidromeSearch,
  remoteSongToTrack,
  type RemoteSearchScope,
} from "@/lib/music/navidrome-client";

const SCOPES = new Set<RemoteSearchScope>(["artists", "albums", "tracks", "all"]);

export async function GET(request: Request) {
  try {
    await assertMusicRemoteAccess();
    if (!isMusicRemoteConfigured()) {
      return NextResponse.json({ error: "Библиотека NAS не настроена" }, { status: 503 });
    }
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const scopeRaw = url.searchParams.get("scope")?.trim() ?? "all";
    const scope: RemoteSearchScope = SCOPES.has(scopeRaw as RemoteSearchScope)
      ? (scopeRaw as RemoteSearchScope)
      : "all";

    if (q.length < 1) {
      return NextResponse.json({ artists: [], albums: [], tracks: [], scope });
    }

    const result = await navidromeSearch(q, scope);
    return NextResponse.json({
      scope,
      artists: result.artists,
      albums: result.albums,
      tracks: result.songs.map(remoteSongToTrack),
    });
  } catch (err) {
    const auth = jsonAuthError(err);
    if (auth.status !== 500) return auth;
    const message = err instanceof Error ? err.message : "Ошибка Navidrome";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
