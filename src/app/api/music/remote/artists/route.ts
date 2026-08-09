import { NextResponse } from "next/server";
import { jsonAuthError } from "@/lib/messenger/guard";
import { assertMusicRemoteAccess } from "@/lib/music/music-access";
import { isMusicRemoteConfigured } from "@/lib/music/navidrome-config";
import { navidromeGetArtists } from "@/lib/music/navidrome-client";

export async function GET() {
  try {
    await assertMusicRemoteAccess();
    if (!isMusicRemoteConfigured()) {
      return NextResponse.json({ error: "Библиотека NAS не настроена" }, { status: 503 });
    }
    const artists = await navidromeGetArtists();
    return NextResponse.json({ artists });
  } catch (err) {
    const auth = jsonAuthError(err);
    if (auth.status !== 500) return auth;
    const message = err instanceof Error ? err.message : "Ошибка Navidrome";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
