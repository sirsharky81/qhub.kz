import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AutocallError, sendFlashCall } from "@/lib/autocall/client";
import {
  MESSENGER_OTP_COOKIE,
  OTP_CHALLENGE_TTL_SEC,
  OTP_DIGITS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SEC,
  OTP_VERIFIED_TTL_SEC,
  REDIS_OTP_CHALLENGE_PREFIX,
  REDIS_OTP_VERIFIED_PREFIX,
} from "./constants";
import { getPinStatus } from "./auth-service";
import { MessengerAuthError } from "./guard";
import { redisDel, redisGetJson, redisSet } from "./redis";

interface OtpChallenge {
  codeHash: string;
  flashCallId: number | null;
  attempts: number;
  createdAt: number;
}

function otpPepper(): string {
  return (
    process.env.MESSENGER_SESSION_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    "qhub-dev-messenger-otp-pepper"
  );
}

function challengeKey(phone: string): string {
  return `${REDIS_OTP_CHALLENGE_PREFIX}${phone}`;
}

function verifiedKey(token: string): string {
  return `${REDIS_OTP_VERIFIED_PREFIX}${token}`;
}

export function hashOtpCode(phone: string, code: string): string {
  return createHmac("sha256", otpPepper()).update(`${phone}:${code}`).digest("hex");
}

function codesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function messengerOtpCookieOptions(token: string) {
  return {
    name: MESSENGER_OTP_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: OTP_VERIFIED_TTL_SEC,
  };
}

export function clearMessengerOtpCookieOptions() {
  return {
    name: MESSENGER_OTP_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export async function sendMessengerOtp(phone: string): Promise<{
  digits: number;
  expiresAt: number;
  resendAfterSec: number;
}> {
  const pinStatus = await getPinStatus(phone);
  if (pinStatus.passwordSet) {
    throw new MessengerAuthError("Номер уже зарегистрирован", 409);
  }

  const existing = await redisGetJson<OtpChallenge>(challengeKey(phone));
  if (existing) {
    const elapsedSec = Math.floor((Date.now() - existing.createdAt) / 1000);
    const wait = OTP_RESEND_COOLDOWN_SEC - elapsedSec;
    if (wait > 0) {
      throw new MessengerAuthError(`Повторный звонок через ${wait} с`, 429);
    }
  }

  let flash: Awaited<ReturnType<typeof sendFlashCall>>;
  try {
    flash = await sendFlashCall({ number: phone, digits: OTP_DIGITS });
  } catch (err) {
    if (err instanceof AutocallError) {
      throw new MessengerAuthError(err.message, err.status >= 400 ? err.status : 502);
    }
    throw err;
  }

  const challenge: OtpChallenge = {
    codeHash: hashOtpCode(phone, flash.code),
    flashCallId: flash.id || null,
    attempts: 0,
    createdAt: Date.now(),
  };
  await redisSet(challengeKey(phone), JSON.stringify(challenge), OTP_CHALLENGE_TTL_SEC);

  return {
    digits: OTP_DIGITS,
    expiresAt: Date.now() + OTP_CHALLENGE_TTL_SEC * 1000,
    resendAfterSec: OTP_RESEND_COOLDOWN_SEC,
  };
}

export async function verifyMessengerOtp(
  phone: string,
  code: string,
): Promise<{ token: string; expiresAt: number }> {
  const normalized = code.replace(/\D/g, "");
  if (!new RegExp(`^\\d{${OTP_DIGITS}}$`).test(normalized)) {
    throw new MessengerAuthError("Неверный код", 400);
  }

  const challenge = await redisGetJson<OtpChallenge>(challengeKey(phone));
  if (!challenge) {
    throw new MessengerAuthError("Код устарел. Запросите новый звонок.", 400);
  }

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await redisDel(challengeKey(phone));
    throw new MessengerAuthError("Слишком много попыток. Запросите новый звонок.", 429);
  }

  const expected = challenge.codeHash;
  const actual = hashOtpCode(phone, normalized);
  if (!codesEqual(expected, actual)) {
    challenge.attempts += 1;
    const left = OTP_CHALLENGE_TTL_SEC - Math.floor((Date.now() - challenge.createdAt) / 1000);
    if (challenge.attempts >= OTP_MAX_ATTEMPTS || left <= 0) {
      await redisDel(challengeKey(phone));
      throw new MessengerAuthError("Слишком много попыток. Запросите новый звонок.", 429);
    }
    await redisSet(challengeKey(phone), JSON.stringify(challenge), left);
    throw new MessengerAuthError("Неверный код", 400);
  }

  await redisDel(challengeKey(phone));
  const token = randomBytes(32).toString("hex");
  await redisSet(verifiedKey(token), JSON.stringify({ phone }), OTP_VERIFIED_TTL_SEC);
  return { token, expiresAt: Date.now() + OTP_VERIFIED_TTL_SEC * 1000 };
}

export async function peekVerifiedOtpPhone(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const stored = await redisGetJson<{ phone?: string }>(verifiedKey(token));
  return typeof stored?.phone === "string" ? stored.phone : null;
}

export async function consumeVerifiedOtp(token: string): Promise<string | null> {
  const phone = await peekVerifiedOtpPhone(token);
  if (!phone) return null;
  await redisDel(verifiedKey(token));
  return phone;
}

export async function assertPinSetupAllowed(input: {
  phone: string;
  sessionPhone?: string | null;
  otpToken?: string | null;
}): Promise<{ via: "session" | "otp"; otpToken?: string }> {
  const sessionOk = Boolean(input.sessionPhone && input.sessionPhone === input.phone);
  if (sessionOk) {
    return { via: "session" };
  }

  const otpPhone = await peekVerifiedOtpPhone(input.otpToken);
  if (!otpPhone || otpPhone !== input.phone) {
    throw new MessengerAuthError("Подтвердите номер звонком", 403);
  }

  const pinStatus = await getPinStatus(input.phone);
  if (pinStatus.passwordSet) {
    throw new MessengerAuthError("Войдите с PIN", 403);
  }

  return { via: "otp", otpToken: input.otpToken ?? undefined };
}
