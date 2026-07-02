import { NextResponse } from "next/server";
import { checkMessengerRateLimit } from "@/lib/rate-limit";
import { CallStoreError, endCallSession } from "@/lib/messenger/call-store";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";

export async function POST(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const { allowed, retryAfterSec } = await checkMessengerRateLimit(`call-end:${phone}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: { callId?: string; reason?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const callId = body.callId?.trim() ?? "";
    if (!callId) {
      return NextResponse.json({ error: "Укажите callId" }, { status: 400 });
    }

    try {
      const session = await endCallSession(callId, phone, body.reason ?? "end");
      if (!session) {
        return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, session });
    } catch (err) {
      if (err instanceof CallStoreError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  } catch (err) {
    return jsonAuthError(err);
  }
}
