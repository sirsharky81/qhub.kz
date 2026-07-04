import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { assertTurnstile } from "@/lib/captcha/turnstile";
import { checkMessengerRateLimit, getClientIp } from "@/lib/rate-limit";
import { getPinStatus, loginWithPin } from "@/lib/messenger/auth-service";
import { assertWhitelistedPhone, jsonAuthError } from "@/lib/messenger/guard";
import { isValidKzPhone, normalizeKzPhone } from "@/lib/messenger/phone";
import {
  createMessengerSessionToken,
  getMessengerSession,
  messengerSessionCookieOptions,
} from "@/lib/messenger/session";
import { setMessengerPresence } from "@/lib/messenger/push-store";
import { MESSENGER_GLOBAL_PRESENCE_CHANNEL } from "@/lib/messenger/constants";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkMessengerRateLimit(`login:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Слишком много запросов" },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
    );
  }

  try {
    let body: { phone?: string; pin?: string; captchaToken?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const captcha = await assertTurnstile(
      typeof body.captchaToken === "string" ? body.captchaToken : undefined,
      ip,
    );
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.error }, { status: captcha.status });
    }

    const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!rawPhone || !isValidKzPhone(normalizeKzPhone(rawPhone))) {
      return NextResponse.json({ error: "Неверный номер телефона" }, { status: 400 });
    }

    const { phone } = await assertWhitelistedPhone(rawPhone);
    const pin = typeof body.pin === "string" ? body.pin : "";
    const result = await loginWithPin(phone, pin);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, lockedUntil: result.lockedUntil },
        { status: result.lockedUntil ? 429 : 401 },
      );
    }

    const token = await createMessengerSessionToken(phone);
    await setMessengerPresence(phone, MESSENGER_GLOBAL_PRESENCE_CHANNEL);
    const jar = await cookies();
    jar.set(messengerSessionCookieOptions(token));
    return NextResponse.json({
      ok: true,
      mustChangePin: result.mustChangePin,
      phone: normalizeKzPhone(phone),
      token,
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}

export async function GET() {
  try {
    const session = await getMessengerSession();
    if (!session) {
      return NextResponse.json({ error: "Нет сессии" }, { status: 401 });
    }
    const status = await getPinStatus(session.phone);
    return NextResponse.json({ phone: session.phone, ...status });
  } catch (err) {
    return jsonAuthError(err);
  }
}
