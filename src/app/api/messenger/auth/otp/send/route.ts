import { NextResponse } from "next/server";
import { assertTurnstile } from "@/lib/captcha/turnstile";
import {
  checkMessengerOtpRecoveryCallRateLimit,
  checkMessengerOtpRecoveryPushRateLimit,
  checkMessengerOtpSendIpRateLimit,
  checkMessengerOtpSendPhoneRateLimit,
  getClientIp,
} from "@/lib/rate-limit";
import { ACCESS_DENIED_MSG, assertMessengerOpenPhone, jsonAuthError, MessengerAuthError } from "@/lib/messenger/guard";
import { parseOtpPurpose, resolveOtpChannel, sendMessengerOtp } from "@/lib/messenger/otp";
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

  let body: { phone?: string; purpose?: string; captchaToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: ACCESS_DENIED_MSG }, { status: 403 });
  }

  const purpose = parseOtpPurpose(body.purpose);
  if (!purpose) {
    return NextResponse.json({ ok: false, error: ACCESS_DENIED_MSG }, { status: 400 });
  }

  if (purpose === "pin_recovery") {
    const captcha = await assertTurnstile(
      typeof body.captchaToken === "string" ? body.captchaToken : undefined,
      ip,
    );
    if (!captcha.ok) {
      return NextResponse.json({ ok: false, error: captcha.error }, { status: captcha.status });
    }
  }

  const raw = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!raw || !isValidKzPhone(normalizeKzPhone(raw))) {
    return NextResponse.json({ ok: false, error: ACCESS_DENIED_MSG }, { status: 403 });
  }

  try {
    const { phone } = await assertMessengerOpenPhone(raw);

    if (purpose === "register") {
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
    } else {
      const channel = await resolveOtpChannel(phone, purpose);
      if (channel === "push") {
        const pushLimit = await checkMessengerOtpRecoveryPushRateLimit(phone);
        if (!pushLimit.allowed) {
          return NextResponse.json(
            { ok: false, error: "Слишком много попыток сброса PIN. Напишите администратору." },
            {
              status: 429,
              headers: pushLimit.retryAfterSec ? { "Retry-After": String(pushLimit.retryAfterSec) } : undefined,
            },
          );
        }
      } else {
        const callLimit = await checkMessengerOtpRecoveryCallRateLimit(phone);
        if (!callLimit.allowed) {
          return NextResponse.json(
            { ok: false, error: "Звонок для сброса PIN уже заказывали сегодня. Напишите администратору." },
            {
              status: 429,
              headers: callLimit.retryAfterSec ? { "Retry-After": String(callLimit.retryAfterSec) } : undefined,
            },
          );
        }
      }
    }

    const result = await sendMessengerOtp(phone, purpose);
    return NextResponse.json({
      ok: true,
      phone,
      digits: result.digits,
      expiresAt: result.expiresAt,
      resendAfterSec: result.resendAfterSec,
      channel: result.channel,
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
