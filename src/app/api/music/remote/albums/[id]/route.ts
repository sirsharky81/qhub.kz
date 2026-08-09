import { NextResponse } from "next/server";
import { jsonAuthError } from "@/lib/messenger/guard";
import { assertMusicRemoteAccess } from "@/lib/music/music-access";
import { isMusicRemoteConfigured } from "@/lib/music/navidrome-config";
import { navidromeGetAlbum, remoteSongToTrack } from "@/lib/music/navidrome-client";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await assertMusicRemoteAccess();
    if (!isMusicRemoteConfigured()) {
      return NextResponse.json({ error: "Библиотека NAS не настроена" }, { status: 503 });
    }
    const { id } = await context.params;
    const album = await navidromeGetAlbum(decodeURIComponent(id));
    return NextResponse.json({
      id: album.id,
      name: album.name,
      artist: album.artist,
      coverArt: album.coverArt,
      tracks: album.songs.map(remoteSongToTrack),
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}
