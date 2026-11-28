import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkMessengerOtpPollRateLimit, getClientIp } from "@/lib/rate-limit";
import { ACCESS_DENIED_MSG, assertMessengerOpenPhone, jsonAuthError, MessengerAuthError } from "@/lib/messenger/guard";
import { messengerOtpCookieOptions, pollMessengerIncomingOtp } from "@/lib/messenger/otp";
import { isValidKzPhone, normalizeKzPhone } from "@/lib/messenger/phone";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkMessengerOtpPollRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, pending: true, error: "Слишком много запросов" },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
    );
  }

  let body: { phone?: string; pollToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, pending: false, error: ACCESS_DENIED_MSG }, { status: 403 });
  }

  const raw = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!raw || !isValidKzPhone(normalizeKzPhone(raw))) {
    return NextResponse.json({ ok: false, pending: false, error: ACCESS_DENIED_MSG }, { status: 403 });
  }

  try {
    const { phone } = await assertMessengerOpenPhone(raw);
    const pollToken = typeof body.pollToken === "string" ? body.pollToken : "";
    const result = await pollMessengerIncomingOtp(phone, pollToken);
    if (result.token) {
      const jar = await cookies();
      jar.set(messengerOtpCookieOptions(result.token));
      return NextResponse.json({
        ok: true,
        pending: false,
        phone,
        callTo: result.callTo,
        otpToken: result.token,
        expiresAt: result.expiresAt,
      });
    }
    return NextResponse.json({
      ok: true,
      pending: true,
      phone,
      callTo: result.callTo,
    });
  } catch (err) {
    if (err instanceof MessengerAuthError) {
      const pending = err.status >= 500;
      return NextResponse.json(
        { ok: false, pending, error: err.message },
        { status: err.status },
      );
    }
    return jsonAuthError(err);
  }
}
