import { NextResponse } from "next/server";
import { checkMessengerRateLimit } from "@/lib/rate-limit";
import { assertChannelParticipant, assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { setMessengerTyping } from "@/lib/messenger/push-store";

export async function POST(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const { allowed, retryAfterSec } = await checkMessengerRateLimit(`typing:${phone}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      channel?: string;
      active?: boolean;
    };
    const channel = typeof body.channel === "string" ? body.channel.trim() : "";
    if (!channel.startsWith("dm:")) {
      return NextResponse.json({ error: "Typing доступен только для dm канала" }, { status: 400 });
    }
    await assertChannelParticipant(phone, channel);
    await setMessengerTyping(channel, phone, body.active !== false);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonAuthError(err);
  }
}
