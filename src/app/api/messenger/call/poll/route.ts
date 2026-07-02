import { NextResponse } from "next/server";
import { checkMessengerCallPollRateLimit } from "@/lib/rate-limit";
import {
  getActiveCallForChannel,
  getCallSession,
  getCallSignalsSince,
} from "@/lib/messenger/call-store";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { peerFromDmChannel } from "@/lib/messenger/phone";

function isParticipant(
  session: { caller: string; callee: string },
  phone: string,
): boolean {
  return session.caller === phone || session.callee === phone;
}

export async function GET(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const { allowed, retryAfterSec } = await checkMessengerCallPollRateLimit(`poll:${phone}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    const url = new URL(request.url);
    const callId = url.searchParams.get("callId")?.trim() ?? "";
    const sinceSeq = Number(url.searchParams.get("since") ?? "0");

    if (!callId) {
      return NextResponse.json({ error: "Укажите callId" }, { status: 400 });
    }

    const session = await getCallSession(callId);
    if (!session) {
      return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });
    }
    if (!isParticipant(session, phone)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const signals = await getCallSignalsSince(callId, sinceSeq);
    return NextResponse.json({ session, signals });
  } catch (err) {
    return jsonAuthError(err);
  }
}

/** Active call on a DM channel (for callee discovery while in chat). */
export async function POST(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const { allowed, retryAfterSec } = await checkMessengerCallPollRateLimit(`active:${phone}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: { channel?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const channel = body.channel?.trim() ?? "";
    if (!channel.startsWith("dm:")) {
      return NextResponse.json({ error: "Укажите DM channel" }, { status: 400 });
    }
    if (!peerFromDmChannel(channel, phone)) {
      return NextResponse.json({ error: "Нет доступа к каналу" }, { status: 403 });
    }

    const session = await getActiveCallForChannel(channel);
    if (!session || session.status === "ended") {
      return NextResponse.json({ active: false });
    }

    return NextResponse.json({
      active: true,
      session,
      incoming: session.callee === phone && session.status === "ringing",
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}
