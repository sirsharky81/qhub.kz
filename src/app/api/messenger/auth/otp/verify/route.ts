import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkMessengerOtpVerifyRateLimit, getClientIp } from "@/lib/rate-limit";
import { ACCESS_DENIED_MSG, assertMessengerOpenPhone, jsonAuthError, MessengerAuthError } from "@/lib/messenger/guard";
import { messengerOtpCookieOptions, verifyMessengerOtp } from "@/lib/messenger/otp";
import { isValidKzPhone, normalizeKzPhone } from "@/lib/messenger/phone";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkMessengerOtpVerifyRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "Слишком много запросов" },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
    );
  }

  let body: { phone?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: ACCESS_DENIED_MSG }, { status: 403 });
  }

  const raw = typeof body.phone === "string" ? body.phone.trim() : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (!raw || !isValidKzPhone(normalizeKzPhone(raw))) {
    return NextResponse.json({ ok: false, error: ACCESS_DENIED_MSG }, { status: 403 });
  }

  try {
    const { phone } = await assertMessengerOpenPhone(raw);
    const result = await verifyMessengerOtp(phone, code);
    const jar = await cookies();
    jar.set(messengerOtpCookieOptions(result.token));
    return NextResponse.json({
      ok: true,
      phone,
      otpToken: result.token,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    if (err instanceof MessengerAuthError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    return jsonAuthError(err);
  }
}
