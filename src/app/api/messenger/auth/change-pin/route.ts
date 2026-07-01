import { NextResponse } from "next/server";
import { checkMessengerRateLimit, getClientIp } from "@/lib/rate-limit";
import { changePin } from "@/lib/messenger/auth-service";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkMessengerRateLimit(`change-pin:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Слишком много запросов" },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
    );
  }

  try {
    const session = await assertMessengerSession();

    let body: { currentPin?: string; newPin?: string; confirmPin?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const currentPin = typeof body.currentPin === "string" ? body.currentPin : "";
    const newPin = typeof body.newPin === "string" ? body.newPin : "";
    const confirmPin = typeof body.confirmPin === "string" ? body.confirmPin : "";

    const result = await changePin(session.phone, currentPin, newPin, confirmPin);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, lockedUntil: result.lockedUntil },
        { status: result.lockedUntil ? 429 : 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonAuthError(err);
  }
}
