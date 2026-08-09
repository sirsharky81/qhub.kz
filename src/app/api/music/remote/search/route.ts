import { NextResponse } from "next/server";
import { jsonAuthError } from "@/lib/messenger/guard";
import { assertMusicRemoteAccess } from "@/lib/music/music-access";
import { isMusicRemoteConfigured } from "@/lib/music/navidrome-config";
import { navidromeSearch, remoteSongToTrack } from "@/lib/music/navidrome-client";

export async function GET(request: Request) {
  try {
    await assertMusicRemoteAccess();
    if (!isMusicRemoteConfigured()) {
      return NextResponse.json({ error: "Библиотека NAS не настроена" }, { status: 503 });
    }
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 1) {
      return NextResponse.json({ artists: [], albums: [], tracks: [] });
    }
    const result = await navidromeSearch(q);
    return NextResponse.json({
      artists: result.artists,
      albums: result.albums,
      tracks: result.songs.map(remoteSongToTrack),
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}
