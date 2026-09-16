import { afterEach, describe, expect, it, vi } from "vitest";
import { OTP_DIGITS, REDIS_OTP_CHALLENGE_PREFIX, REDIS_OTP_VERIFIED_PREFIX } from "./constants";
import { redisDel } from "./redis";
import type { MessengerPushSubscription } from "./types";

const sendFlashCall = vi.hoisted(() =>
  vi.fn(async (input: { number: string; digits?: number }) => ({
    id: 42,
    code: "7482",
    number: input.number,
  })),
);

const notifyPinRecovery = vi.hoisted(() =>
  vi.fn(async (_phone: string, _code: string) => true),
);

const getMessengerPushSubscriptions = vi.hoisted(() =>
  vi.fn(async (): Promise<MessengerPushSubscription[]> => []),
);

vi.mock("@/lib/autocall/client", () => ({
  AutocallError: class AutocallError extends Error {
    status = 502;
    code = "unavailable";
  },
  sendFlashCall,
}));

vi.mock("./push-notify", () => ({
  notifyPinRecovery,
}));

vi.mock("./push-store", () => ({
  getMessengerPushSubscriptions,
}));

vi.mock("./auth-service", () => ({
  getPinStatus: vi.fn(async () => ({
    passwordSet: false,
    mustChangePin: false,
    lockedUntil: null,
  })),
}));

const isPhoneWhitelisted = vi.hoisted(() => vi.fn(async () => false));

vi.mock("./store", () => ({
  isPhoneWhitelisted,
}));

import { getPinStatus } from "./auth-service";
import {
  assertPinSetupAllowed,
  consumeVerifiedOtp,
  hashOtpCode,
  sendMessengerOtp,
  verifyMessengerOtp,
} from "./otp";

const phone = "+77011234567";
const pushSub: MessengerPushSubscription = {
  endpoint: "https://push.example/sub",
  keys: { p256dh: "a", auth: "b" },
};

afterEach(async () => {
  vi.clearAllMocks();
  vi.mocked(getPinStatus).mockResolvedValue({
    passwordSet: false,
    mustChangePin: false,
    lockedUntil: null,
  });
  getMessengerPushSubscriptions.mockResolvedValue([]);
  notifyPinRecovery.mockResolvedValue(true);
  isPhoneWhitelisted.mockResolvedValue(false);
  await redisDel(`${REDIS_OTP_CHALLENGE_PREFIX}${phone}`);
});

describe("messenger flash-call OTP", () => {
  it("hashes codes the same way for a phone", () => {
    expect(hashOtpCode(phone, "7482")).toBe(hashOtpCode(phone, "7482"));
    expect(hashOtpCode(phone, "7482")).not.toBe(hashOtpCode(phone, "7483"));
  });

  it("stores a challenge and accepts the flash-call code", async () => {
    const sent = await sendMessengerOtp(phone);
    expect(sent.digits).toBe(OTP_DIGITS);
    expect(sent.channel).toBe("call");
    expect(sendFlashCall).toHaveBeenCalledWith({ number: phone, digits: OTP_DIGITS });
    expect(notifyPinRecovery).not.toHaveBeenCalled();

    await expect(verifyMessengerOtp(phone, "0000")).rejects.toThrow("Неверный код");
    const verified = await verifyMessengerOtp(phone, "7482");
    expect(verified.token).toMatch(/^[a-f0-9]{64}$/);

    const consumed = await consumeVerifiedOtp(verified.token);
    expect(consumed).toBe(phone);
    expect(await consumeVerifiedOtp(verified.token)).toBeNull();
    await redisDel(`${REDIS_OTP_VERIFIED_PREFIX}${verified.token}`);
  });

  it("rejects PIN setup without a verified OTP or session", async () => {
    await expect(assertPinSetupAllowed({ phone })).rejects.toThrow("Подтвердите номер звонком");
    isPhoneWhitelisted.mockResolvedValue(true);
    await expect(assertPinSetupAllowed({ phone, sessionPhone: phone })).resolves.toEqual({
      via: "session",
    });
  });

  it("does not treat a leftover session as proof after the number was deleted", async () => {
    isPhoneWhitelisted.mockResolvedValue(false);
    await expect(assertPinSetupAllowed({ phone, sessionPhone: phone })).rejects.toThrow(
      "Подтвердите номер звонком",
    );
  });

  it("allows PIN setup after OTP when the number has no PIN yet", async () => {
    await sendMessengerOtp(phone);
    const verified = await verifyMessengerOtp(phone, "7482");
    await expect(
      assertPinSetupAllowed({ phone, otpToken: verified.token }),
    ).resolves.toEqual({ via: "otp", otpToken: verified.token });
    await redisDel(`${REDIS_OTP_VERIFIED_PREFIX}${verified.token}`);
  });

  it("does not allow registration OTP to overwrite an existing PIN", async () => {
    await sendMessengerOtp(phone);
    const verified = await verifyMessengerOtp(phone, "7482");
    vi.mocked(getPinStatus).mockResolvedValue({
      passwordSet: true,
      mustChangePin: false,
      lockedUntil: null,
    });
    isPhoneWhitelisted.mockResolvedValue(true);
    await expect(assertPinSetupAllowed({ phone, otpToken: verified.token })).rejects.toThrow(
      "Войдите с PIN",
    );
    await redisDel(`${REDIS_OTP_VERIFIED_PREFIX}${verified.token}`);
  });

  it("allows re-registration OTP when a PIN is leftover after whitelist delete", async () => {
    vi.mocked(getPinStatus).mockResolvedValue({
      passwordSet: true,
      mustChangePin: false,
      lockedUntil: null,
    });
    isPhoneWhitelisted.mockResolvedValue(false);

    const sent = await sendMessengerOtp(phone, "register");
    expect(sent.channel).toBe("call");
    expect(sendFlashCall).toHaveBeenCalled();

    const verified = await verifyMessengerOtp(phone, "7482");
    await expect(assertPinSetupAllowed({ phone, otpToken: verified.token })).resolves.toEqual({
      via: "otp",
      otpToken: verified.token,
    });
    await redisDel(`${REDIS_OTP_VERIFIED_PREFIX}${verified.token}`);
  });
});

describe("messenger PIN recovery OTP", () => {
  it("sends recovery by push and skips AutoCall when subscriptions exist", async () => {
    vi.mocked(getPinStatus).mockResolvedValue({
      passwordSet: true,
      mustChangePin: false,
      lockedUntil: null,
    });
    getMessengerPushSubscriptions.mockResolvedValue([pushSub]);
    let pushCode = "";
    notifyPinRecovery.mockImplementation(async (_phone, code) => {
      pushCode = code;
      return true;
    });

    const sent = await sendMessengerOtp(phone, "pin_recovery");
    expect(sent.channel).toBe("push");
    expect(sendFlashCall).not.toHaveBeenCalled();
    expect(notifyPinRecovery).toHaveBeenCalledWith(phone, expect.stringMatching(/^\d{4}$/));
    expect(pushCode).toMatch(/^\d{4}$/);

    const verified = await verifyMessengerOtp(phone, pushCode);
    await expect(assertPinSetupAllowed({ phone, otpToken: verified.token })).resolves.toEqual({
      via: "otp",
      otpToken: verified.token,
    });
    await redisDel(`${REDIS_OTP_VERIFIED_PREFIX}${verified.token}`);
  });

  it("falls back to flash-call recovery when there is no push subscription", async () => {
    vi.mocked(getPinStatus).mockResolvedValue({
      passwordSet: true,
      mustChangePin: false,
      lockedUntil: null,
    });
    getMessengerPushSubscriptions.mockResolvedValue([]);

    const sent = await sendMessengerOtp(phone, "pin_recovery");
    expect(sent.channel).toBe("call");
    expect(sendFlashCall).toHaveBeenCalledWith({ number: phone, digits: OTP_DIGITS });
    expect(notifyPinRecovery).not.toHaveBeenCalled();

    const verified = await verifyMessengerOtp(phone, "7482");
    await expect(assertPinSetupAllowed({ phone, otpToken: verified.token })).resolves.toEqual({
      via: "otp",
      otpToken: verified.token,
    });
    await redisDel(`${REDIS_OTP_VERIFIED_PREFIX}${verified.token}`);
  });
});
