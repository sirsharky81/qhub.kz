import { NextResponse } from "next/server";
import { checkMessengerCallSignalRateLimit } from "@/lib/rate-limit";
import { appendCallSignal, CallStoreError, getCallSession } from "@/lib/messenger/call-store";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import type { CallSignalType } from "@/lib/messenger/types";

const ALLOWED_TYPES: CallSignalType[] = [
  "offer",
  "answer",
  "ice",
  "screen-offer",
  "screen-answer",
  "screen-ice",
  "screen-stop",
  "accept",
  "reject",
  "end",
  "busy",
];

export async function POST(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const { allowed, retryAfterSec } = await checkMessengerCallSignalRateLimit(`signal:${phone}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: { callId?: string; type?: CallSignalType; payload?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const callId = body.callId?.trim() ?? "";
    const type = body.type;
    if (!callId || !type || !ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ error: "Неполные данные сигнала" }, { status: 400 });
    }

    const session = await getCallSession(callId);
    if (!session) {
      return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });
    }

    if (type === "offer" && phone !== session.caller) {
      return NextResponse.json({ error: "Offer только от звонящего" }, { status: 403 });
    }
    if ((type === "answer" || type === "accept") && phone !== session.callee) {
      return NextResponse.json({ error: "Answer только от принимающего" }, { status: 403 });
    }

    const payload =
      typeof body.payload === "string" && body.payload.length > 0
        ? body.payload.slice(0, 32_000)
        : undefined;

    if (
      (type === "offer" ||
        type === "answer" ||
        type === "ice" ||
        type === "screen-offer" ||
        type === "screen-answer" ||
        type === "screen-ice") &&
      !payload
    ) {
      return NextResponse.json({ error: "Требуется payload" }, { status: 400 });
    }

    try {
      const result = await appendCallSignal({ callId, from: phone, type, payload });
      if (!result) {
        return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        session: result.session,
        signal: result.signal,
      });
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
