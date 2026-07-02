import { NextResponse } from "next/server";
import { checkMessengerRateLimit } from "@/lib/rate-limit";
import { refreshCallHeartbeat } from "@/lib/messenger/call-store";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";

export async function POST(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const { allowed, retryAfterSec } = await checkMessengerRateLimit(`call-heartbeat:${phone}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: { callId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const callId = body.callId?.trim() ?? "";
    if (!callId) {
      return NextResponse.json({ error: "Укажите callId" }, { status: 400 });
    }

    const ok = await refreshCallHeartbeat(callId, phone);
    if (!ok) {
      return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonAuthError(err);
  }
}
