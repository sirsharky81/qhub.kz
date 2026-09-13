import { NextResponse } from "next/server";
import {
  checkMessengerOtpSendIpRateLimit,
  checkMessengerOtpSendPhoneRateLimit,
  getClientIp,
} from "@/lib/rate-limit";
import { ACCESS_DENIED_MSG, assertMessengerOpenPhone, jsonAuthError, MessengerAuthError } from "@/lib/messenger/guard";
import { sendMessengerOtp } from "@/lib/messenger/otp";
import { isValidKzPhone, normalizeKzPhone } from "@/lib/messenger/phone";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const ipLimit = await checkMessengerOtpSendIpRateLimit(ip);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Слишком много запросов" },
      { status: 429, headers: ipLimit.retryAfterSec ? { "Retry-After": String(ipLimit.retryAfterSec) } : undefined },
    );
  }

  let body: { phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: ACCESS_DENIED_MSG }, { status: 403 });
  }

  const raw = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!raw || !isValidKzPhone(normalizeKzPhone(raw))) {
    return NextResponse.json({ ok: false, error: ACCESS_DENIED_MSG }, { status: 403 });
  }

  try {
    const { phone } = await assertMessengerOpenPhone(raw);
    const phoneLimit = await checkMessengerOtpSendPhoneRateLimit(phone);
    if (!phoneLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Слишком много звонков. Подождите несколько минут." },
        {
          status: 429,
          headers: phoneLimit.retryAfterSec ? { "Retry-After": String(phoneLimit.retryAfterSec) } : undefined,
        },
      );
    }

    const result = await sendMessengerOtp(phone);
    return NextResponse.json({
      ok: true,
      phone,
      digits: result.digits,
      expiresAt: result.expiresAt,
      resendAfterSec: result.resendAfterSec,
    });
  } catch (err) {
    if (err instanceof MessengerAuthError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        {
          status: err.status,
          headers: err.status === 429 ? { "Retry-After": "60" } : undefined,
        },
      );
    }
    return jsonAuthError(err);
  }
}
