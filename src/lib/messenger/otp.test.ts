import { afterEach, describe, expect, it, vi } from "vitest";
import { OTP_DIGITS, REDIS_OTP_CHALLENGE_PREFIX, REDIS_OTP_VERIFIED_PREFIX } from "./constants";
import { redisDel } from "./redis";

const sendFlashCall = vi.hoisted(() =>
  vi.fn(async (input: { number: string; digits?: number }) => ({
    id: 42,
    code: "7482",
    number: input.number,
  })),
);

vi.mock("@/lib/autocall/client", () => ({
  AutocallError: class AutocallError extends Error {
    status = 502;
    code = "unavailable";
  },
  sendFlashCall,
}));

vi.mock("./auth-service", () => ({
  getPinStatus: vi.fn(async () => ({
    passwordSet: false,
    mustChangePin: false,
    lockedUntil: null,
  })),
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

afterEach(async () => {
  vi.clearAllMocks();
  vi.mocked(getPinStatus).mockResolvedValue({
    passwordSet: false,
    mustChangePin: false,
    lockedUntil: null,
  });
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
    expect(sendFlashCall).toHaveBeenCalledWith({ number: phone, digits: OTP_DIGITS });

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
    await expect(assertPinSetupAllowed({ phone, sessionPhone: phone })).resolves.toEqual({
      via: "session",
    });
  });

  it("allows PIN setup after OTP when the number has no PIN yet", async () => {
    await sendMessengerOtp(phone);
    const verified = await verifyMessengerOtp(phone, "7482");
    await expect(
      assertPinSetupAllowed({ phone, otpToken: verified.token }),
    ).resolves.toEqual({ via: "otp", otpToken: verified.token });
    await redisDel(`${REDIS_OTP_VERIFIED_PREFIX}${verified.token}`);
  });
});
