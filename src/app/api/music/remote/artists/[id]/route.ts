import { NextResponse } from "next/server";
import { jsonAuthError } from "@/lib/messenger/guard";
import { assertMusicRemoteAccess } from "@/lib/music/music-access";
import { isMusicRemoteConfigured } from "@/lib/music/navidrome-config";
import { navidromeGetArtist } from "@/lib/music/navidrome-client";

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
    const artist = await navidromeGetArtist(decodeURIComponent(id));
    return NextResponse.json(artist);
  } catch (err) {
    return jsonAuthError(err);
  }
}
