import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkMessengerRateLimit, getClientIp } from "@/lib/rate-limit";
import { setPin } from "@/lib/messenger/auth-service";
import { assertWhitelistedPhone, jsonAuthError, MessengerAuthError } from "@/lib/messenger/guard";
import { isValidKzPhone, normalizeKzPhone } from "@/lib/messenger/phone";
import {
  createMessengerSessionToken,
  getMessengerSession,
  messengerSessionCookieOptions,
} from "@/lib/messenger/session";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkMessengerRateLimit(`setpin:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Слишком много запросов" },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
    );
  }

  try {
    let body: { phone?: string; pin?: string; confirmPin?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!rawPhone || !isValidKzPhone(normalizeKzPhone(rawPhone))) {
      return NextResponse.json({ error: "Неверный номер телефона" }, { status: 400 });
    }

    const { phone } = await assertWhitelistedPhone(rawPhone);
    const session = await getMessengerSession();
    if (!session || normalizeKzPhone(session.phone) !== normalizeKzPhone(phone)) {
      throw new MessengerAuthError("Требуется вход в мессенджер", 403);
    }

    const pin = typeof body.pin === "string" ? body.pin : "";
    const confirmPin = typeof body.confirmPin === "string" ? body.confirmPin : undefined;
    const result = await setPin(phone, pin, confirmPin);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const token = await createMessengerSessionToken(phone);
    const jar = await cookies();
    jar.set(messengerSessionCookieOptions(token));
    return NextResponse.json({ ok: true, phone: normalizeKzPhone(phone) });
  } catch (err) {
    return jsonAuthError(err);
  }
}
