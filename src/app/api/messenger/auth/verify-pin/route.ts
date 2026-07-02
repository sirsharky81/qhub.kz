import { NextResponse } from "next/server";
import { checkMessengerRateLimit, getClientIp } from "@/lib/rate-limit";
import { loginWithPin } from "@/lib/messenger/auth-service";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";

/** Verify PIN for an already authenticated session (PIN unlock gate — no CAPTCHA). */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkMessengerRateLimit(`verify-pin:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Слишком много запросов" },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
    );
  }

  try {
    const { phone } = await assertMessengerSession();

    let body: { pin?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const pin = typeof body.pin === "string" ? body.pin : "";
    const result = await loginWithPin(phone, pin);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, lockedUntil: result.lockedUntil },
        { status: result.lockedUntil ? 429 : 401 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonAuthError(err);
  }
}
