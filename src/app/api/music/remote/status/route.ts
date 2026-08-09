import { NextResponse } from "next/server";
import { getMessengerSession } from "@/lib/messenger/session";
import { jsonAuthError } from "@/lib/messenger/guard";
import { isMusicEnabledForPhone } from "@/lib/music/music-access";
import { isMusicRemoteConfigured } from "@/lib/music/navidrome-config";
import { navidromePing } from "@/lib/music/navidrome-client";
import { normalizeKzPhone } from "@/lib/messenger/phone";

export async function GET() {
  try {
    const configured = isMusicRemoteConfigured();
    const session = await getMessengerSession();
    if (!session) {
      return NextResponse.json({
        configured,
        allowed: false,
        musicEnabled: false,
        online: false,
      });
    }

    const phone = normalizeKzPhone(session.phone);
    const musicEnabled = await isMusicEnabledForPhone(phone);
    if (!configured || !musicEnabled) {
      return NextResponse.json({
        configured,
        allowed: false,
        musicEnabled,
        online: false,
      });
    }

    let online = false;
    try {
      online = await navidromePing();
    } catch {
      online = false;
    }

    return NextResponse.json({
      configured,
      allowed: online,
      musicEnabled,
      online,
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}
