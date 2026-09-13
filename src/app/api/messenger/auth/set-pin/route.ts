import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkMessengerRateLimit, getClientIp } from "@/lib/rate-limit";
import { setPin } from "@/lib/messenger/auth-service";
import { MESSENGER_OTP_COOKIE } from "@/lib/messenger/constants";
import { normalizeDisplayName } from "@/lib/messenger/display-name";
import { assertMessengerOpenPhone, jsonAuthError, MessengerAuthError } from "@/lib/messenger/guard";
import {
  assertPinSetupAllowed,
  clearMessengerOtpCookieOptions,
  consumeVerifiedOtp,
} from "@/lib/messenger/otp";
import { isValidKzPhone, normalizeKzPhone } from "@/lib/messenger/phone";
import {
  ensureSelfRegisteredWhitelist,
  getProfile,
  markWhitelistVerified,
  saveProfile,
} from "@/lib/messenger/store";
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
    let body: { phone?: string; pin?: string; confirmPin?: string; otpToken?: string; displayName?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!rawPhone || !isValidKzPhone(normalizeKzPhone(rawPhone))) {
      return NextResponse.json({ error: "Неверный номер телефона" }, { status: 400 });
    }

    const { phone, selfRegistration } = await assertMessengerOpenPhone(rawPhone);
    const session = await getMessengerSession();
    if (session && normalizeKzPhone(session.phone) !== normalizeKzPhone(phone)) {
      throw new MessengerAuthError("Требуется вход в мессенджер", 403);
    }

    const jar = await cookies();
    const otpToken =
      (typeof body.otpToken === "string" && body.otpToken.trim()) ||
      jar.get(MESSENGER_OTP_COOKIE)?.value ||
      null;
    const setup = await assertPinSetupAllowed({
      phone,
      sessionPhone: session ? normalizeKzPhone(session.phone) : null,
      otpToken,
    });

    const displayName = normalizeDisplayName(
      typeof body.displayName === "string" ? body.displayName : "",
    );
    if (setup.via === "otp" && selfRegistration && !displayName) {
      throw new MessengerAuthError("Введите имя", 400);
    }

    if (setup.via === "otp" && selfRegistration) {
      await ensureSelfRegisteredWhitelist(phone);
    }
    if (setup.via === "otp") {
      await markWhitelistVerified(phone);
    }

    const pin = typeof body.pin === "string" ? body.pin : "";
    const confirmPin = typeof body.confirmPin === "string" ? body.confirmPin : undefined;
    const result = await setPin(phone, pin, confirmPin);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (setup.via === "otp" && selfRegistration && displayName) {
      const prev = await getProfile(phone);
      await saveProfile({
        phone,
        displayName,
        avatarUrl: prev?.avatarUrl ?? null,
        allowRoomAutoAdd: prev?.allowRoomAutoAdd ?? true,
        updatedAt: Date.now(),
      });
    }

    if (setup.via === "otp" && setup.otpToken) {
      await consumeVerifiedOtp(setup.otpToken);
      jar.set(clearMessengerOtpCookieOptions());
    }

    const token = await createMessengerSessionToken(phone);
    jar.set(messengerSessionCookieOptions(token));
    return NextResponse.json({ ok: true, phone: normalizeKzPhone(phone), token });
  } catch (err) {
    return jsonAuthError(err);
  }
}
