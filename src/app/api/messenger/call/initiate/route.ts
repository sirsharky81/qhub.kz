import { NextResponse } from "next/server";
import { checkMessengerRateLimit } from "@/lib/rate-limit";
import {
  CallStoreError,
  clearStaleActiveCall,
  createCallSession,
  getActiveCallForChannel,
} from "@/lib/messenger/call-store";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { notifyIncomingCall } from "@/lib/messenger/push-notify";
import { deriveDmChatId, peerFromDmChannel } from "@/lib/messenger/phone";

export async function POST(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const { allowed, retryAfterSec } = await checkMessengerRateLimit(`call-initiate:${phone}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: { channel?: string; peerPhone?: string; media?: "audio" | "video" };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const media = body.media === "video" ? "video" : "audio";

    const channel =
      body.channel?.trim() ||
      (body.peerPhone ? deriveDmChatId(phone, body.peerPhone) : "");
    if (!channel.startsWith("dm:")) {
      return NextResponse.json({ error: "Звонки доступны только в личных чатах" }, { status: 400 });
    }

    const peer = peerFromDmChannel(channel, phone);
    if (!peer) {
      return NextResponse.json({ error: "Нет доступа к каналу" }, { status: 403 });
    }

    try {
      await clearStaleActiveCall(channel, phone);
      const session = await createCallSession({
        channel,
        caller: phone,
        callee: peer,
        media,
      });

      try {
        await notifyIncomingCall({
          channel,
          callId: session.callId,
          callerPhone: phone,
          calleePhone: peer,
          media,
        });
      } catch (err) {
        console.warn("[call] incoming push dispatch failed:", err);
      }

      return NextResponse.json({ ok: true, callId: session.callId, session });
    } catch (err) {
      if (err instanceof CallStoreError && err.message === "busy") {
        const active = await getActiveCallForChannel(channel);
        return NextResponse.json(
          { ok: false, error: "busy", callId: active?.callId },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (err) {
    return jsonAuthError(err);
  }
}
