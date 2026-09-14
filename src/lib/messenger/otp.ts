import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
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
import { notifyPinRecovery } from "./push-notify";
import { getMessengerPushSubscriptions } from "./push-store";
import { redisDel, redisGetJson, redisSet } from "./redis";

export type OtpPurpose = "register" | "pin_recovery";
export type OtpChannel = "push" | "call";

interface OtpChallenge {
  codeHash: string;
  flashCallId: number | null;
  attempts: number;
  createdAt: number;
  purpose: OtpPurpose;
  channel: OtpChannel;
}

interface VerifiedOtp {
  phone: string;
  purpose: OtpPurpose;
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

export function parseOtpPurpose(value: unknown): OtpPurpose | null {
  if (value === undefined || value === null || value === "") return "register";
  if (value === "register" || value === "pin_recovery") return value;
  return null;
}

export async function resolveOtpChannel(phone: string, purpose: OtpPurpose): Promise<OtpChannel> {
  if (purpose !== "pin_recovery") return "call";
  const subs = await getMessengerPushSubscriptions(phone);
  return subs.length > 0 ? "push" : "call";
}

function generatePushOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, "0");
}

function retryHint(channel: OtpChannel | undefined): string {
  return channel === "push" ? "Запросите новый код." : "Запросите новый звонок.";
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

export async function sendMessengerOtp(
  phone: string,
  purpose: OtpPurpose = "register",
): Promise<{
  digits: number;
  expiresAt: number;
  resendAfterSec: number;
  channel: OtpChannel;
}> {
  const pinStatus = await getPinStatus(phone);
  if (purpose === "register") {
    if (pinStatus.passwordSet) {
      throw new MessengerAuthError("Номер уже зарегистрирован", 409);
    }
  } else if (!pinStatus.passwordSet) {
    throw new MessengerAuthError("PIN ещё не задан", 400);
  }

  const existing = await redisGetJson<OtpChallenge>(challengeKey(phone));
  if (existing) {
    const elapsedSec = Math.floor((Date.now() - existing.createdAt) / 1000);
    const wait = OTP_RESEND_COOLDOWN_SEC - elapsedSec;
    if (wait > 0) {
      const prefix = existing.channel === "push" ? "Повторная отправка" : "Повторный звонок";
      throw new MessengerAuthError(`${prefix} через ${wait} с`, 429);
    }
  }

  const channel = await resolveOtpChannel(phone, purpose);
  let code: string;
  let flashCallId: number | null = null;

  if (channel === "push") {
    code = generatePushOtpCode();
    const delivered = await notifyPinRecovery(phone, code);
    if (!delivered) {
      throw new MessengerAuthError("Не удалось отправить уведомление. Напишите администратору.", 502);
    }
  } else {
    try {
      const flash = await sendFlashCall({ number: phone, digits: OTP_DIGITS });
      code = flash.code;
      flashCallId = flash.id || null;
    } catch (err) {
      if (err instanceof AutocallError) {
        const message =
          purpose === "pin_recovery"
            ? "Не удалось подтвердить номер звонком. Напишите администратору."
            : err.message;
        throw new MessengerAuthError(message, err.status >= 400 ? err.status : 502);
      }
      throw err;
    }
  }

  const challenge: OtpChallenge = {
    codeHash: hashOtpCode(phone, code),
    flashCallId,
    attempts: 0,
    createdAt: Date.now(),
    purpose,
    channel,
  };
  await redisSet(challengeKey(phone), JSON.stringify(challenge), OTP_CHALLENGE_TTL_SEC);

  return {
    digits: OTP_DIGITS,
    expiresAt: Date.now() + OTP_CHALLENGE_TTL_SEC * 1000,
    resendAfterSec: OTP_RESEND_COOLDOWN_SEC,
    channel,
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

  const hint = retryHint(challenge.channel);
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await redisDel(challengeKey(phone));
    throw new MessengerAuthError(`Слишком много попыток. ${hint}`, 429);
  }

  const expected = challenge.codeHash;
  const actual = hashOtpCode(phone, normalized);
  if (!codesEqual(expected, actual)) {
    challenge.attempts += 1;
    const left = OTP_CHALLENGE_TTL_SEC - Math.floor((Date.now() - challenge.createdAt) / 1000);
    if (challenge.attempts >= OTP_MAX_ATTEMPTS || left <= 0) {
      await redisDel(challengeKey(phone));
      throw new MessengerAuthError(`Слишком много попыток. ${hint}`, 429);
    }
    await redisSet(challengeKey(phone), JSON.stringify(challenge), left);
    throw new MessengerAuthError("Неверный код", 400);
  }

  await redisDel(challengeKey(phone));
  const token = randomBytes(32).toString("hex");
  const verified: VerifiedOtp = {
    phone,
    purpose: challenge.purpose ?? "register",
  };
  await redisSet(verifiedKey(token), JSON.stringify(verified), OTP_VERIFIED_TTL_SEC);
  return { token, expiresAt: Date.now() + OTP_VERIFIED_TTL_SEC * 1000 };
}

export async function peekVerifiedOtp(
  token: string | null | undefined,
): Promise<VerifiedOtp | null> {
  if (!token) return null;
  const stored = await redisGetJson<VerifiedOtp>(verifiedKey(token));
  if (typeof stored?.phone !== "string") return null;
  return {
    phone: stored.phone,
    purpose: stored.purpose === "pin_recovery" ? "pin_recovery" : "register",
  };
}

export async function peekVerifiedOtpPhone(token: string | null | undefined): Promise<string | null> {
  const stored = await peekVerifiedOtp(token);
  return stored?.phone ?? null;
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

  const verified = await peekVerifiedOtp(input.otpToken);
  if (!verified || verified.phone !== input.phone) {
    throw new MessengerAuthError("Подтвердите номер звонком", 403);
  }

  const pinStatus = await getPinStatus(input.phone);
  if (pinStatus.passwordSet && verified.purpose !== "pin_recovery") {
    throw new MessengerAuthError("Войдите с PIN", 403);
  }

  return { via: "otp", otpToken: input.otpToken ?? undefined };
}
