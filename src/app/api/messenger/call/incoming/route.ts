import { NextResponse } from "next/server";
import { checkMessengerCallPollRateLimit } from "@/lib/rate-limit";
import { getCallSession, getIncomingCallForUser } from "@/lib/messenger/call-store";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";

export async function GET() {
  try {
    const { phone } = await assertMessengerSession();
    const { allowed, retryAfterSec } = await checkMessengerCallPollRateLimit(`incoming:${phone}`);
    if (!allowed) {
      return NextResponse.json(
        { incoming: false },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    const pending = await getIncomingCallForUser(phone);
    if (!pending) {
      return NextResponse.json({ incoming: false });
    }

    const session = await getCallSession(pending.callId);
    if (!session || session.status !== "ringing") {
      return NextResponse.json({ incoming: false });
    }

    return NextResponse.json({
      incoming: true,
      callId: pending.callId,
      channel: pending.channel,
      callerPhone: pending.caller,
      media: session.media === "video" ? "video" : "audio",
      session,
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}
