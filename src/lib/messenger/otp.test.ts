import { afterEach, describe, expect, it, vi } from "vitest";
import { OTP_CHALLENGE_TTL_SEC, OTP_DIGITS, REDIS_OTP_CHALLENGE_PREFIX, REDIS_OTP_VERIFIED_PREFIX } from "./constants";
import { redisDel } from "./redis";
import type { MessengerPushSubscription } from "./types";

const createIncomingCallOtp = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 42,
    callTo: "+77470940670",
    status: "pending",
  })),
);

const getIncomingCallOtp = vi.hoisted(() =>
  vi.fn(async () => ({
    id: 42,
    callTo: "+77470940670",
    status: "pending",
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
  createIncomingCallOtp,
  getIncomingCallOtp,
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
  pollMessengerIncomingOtp,
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

async function confirmIncomingCall(pollToken: string): Promise<{ token: string }> {
  getIncomingCallOtp.mockResolvedValueOnce({
    id: 42,
    callTo: "+77470940670",
    status: "verified",
  });
  const verified = await pollMessengerIncomingOtp(phone, pollToken);
  if (!verified.token) throw new Error("expected otp token");
  return { token: verified.token };
}

describe("messenger incoming-call OTP", () => {
  it("hashes codes the same way for a phone", () => {
    expect(hashOtpCode(phone, "7482")).toBe(hashOtpCode(phone, "7482"));
    expect(hashOtpCode(phone, "7482")).not.toBe(hashOtpCode(phone, "7483"));
  });

  it("stores a challenge and accepts the incoming call", async () => {
    const sent = await sendMessengerOtp(phone);
    expect(sent.digits).toBe(0);
    expect(sent.channel).toBe("call");
    expect(sent.callTo).toBe("+77470940670");
    expect(sent.pollToken).toMatch(/^[a-f0-9]{64}$/);
    expect(createIncomingCallOtp).toHaveBeenCalledWith({
      number: phone,
      callbackUrl: expect.stringMatching(/\/api\/messenger\/auth\/otp\/hook$/),
      ttlSec: OTP_CHALLENGE_TTL_SEC,
    });
    expect(notifyPinRecovery).not.toHaveBeenCalled();

    getIncomingCallOtp.mockResolvedValueOnce({
      id: 42,
      callTo: "+77470940670",
      status: "pending",
    });
    await expect(pollMessengerIncomingOtp(phone, sent.pollToken)).resolves.toMatchObject({ pending: true });
    const verified = await confirmIncomingCall(sent.pollToken!);
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

  it("does not expose the verified token without the per-call poll token", async () => {
    const sent = await sendMessengerOtp(phone);
    expect(sent.pollToken).toBeTruthy();
    getIncomingCallOtp.mockResolvedValue({
      id: 42,
      callTo: "+77470940670",
      status: "verified",
    });

    await expect(pollMessengerIncomingOtp(phone, undefined)).rejects.toThrow("Запросите звонок ещё раз");
    await expect(pollMessengerIncomingOtp(phone, "wrong-token")).rejects.toThrow("Запросите звонок ещё раз");
    await expect(pollMessengerIncomingOtp(phone, sent.pollToken)).resolves.toMatchObject({
      pending: false,
      token: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("does not treat a leftover session as proof after the number was deleted", async () => {
    isPhoneWhitelisted.mockResolvedValue(false);
    await expect(assertPinSetupAllowed({ phone, sessionPhone: phone })).rejects.toThrow(
      "Подтвердите номер звонком",
    );
  });

  it("allows PIN setup after OTP when the number has no PIN yet", async () => {
    const sent = await sendMessengerOtp(phone);
    const verified = await confirmIncomingCall(sent.pollToken!);
    await expect(
      assertPinSetupAllowed({ phone, otpToken: verified.token }),
    ).resolves.toEqual({ via: "otp", otpToken: verified.token });
    await redisDel(`${REDIS_OTP_VERIFIED_PREFIX}${verified.token}`);
  });

  it("does not allow registration OTP to overwrite an existing PIN", async () => {
    const sent = await sendMessengerOtp(phone);
    const verified = await confirmIncomingCall(sent.pollToken!);
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
    expect(createIncomingCallOtp).toHaveBeenCalled();

    const verified = await confirmIncomingCall(sent.pollToken!);
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
    expect(createIncomingCallOtp).not.toHaveBeenCalled();
    expect(notifyPinRecovery).toHaveBeenCalledWith(phone, expect.stringMatching(/^\d{4}$/));
    expect(pushCode).toMatch(/^\d{4}$/);

    const verified = await verifyMessengerOtp(phone, pushCode);
    await expect(assertPinSetupAllowed({ phone, otpToken: verified.token })).resolves.toEqual({
      via: "otp",
      otpToken: verified.token,
    });
    await redisDel(`${REDIS_OTP_VERIFIED_PREFIX}${verified.token}`);
  });

  it("falls back to an incoming call when there is no push subscription", async () => {
    vi.mocked(getPinStatus).mockResolvedValue({
      passwordSet: true,
      mustChangePin: false,
      lockedUntil: null,
    });
    getMessengerPushSubscriptions.mockResolvedValue([]);

    const sent = await sendMessengerOtp(phone, "pin_recovery");
    expect(sent.channel).toBe("call");
    expect(sent.callTo).toBe("+77470940670");
    expect(createIncomingCallOtp).toHaveBeenCalledWith({
      number: phone,
      callbackUrl: expect.stringMatching(/\/api\/messenger\/auth\/otp\/hook$/),
      ttlSec: OTP_CHALLENGE_TTL_SEC,
    });
    expect(notifyPinRecovery).not.toHaveBeenCalled();

    const verified = await confirmIncomingCall(sent.pollToken!);
    await expect(assertPinSetupAllowed({ phone, otpToken: verified.token })).resolves.toEqual({
      via: "otp",
      otpToken: verified.token,
    });
    await redisDel(`${REDIS_OTP_VERIFIED_PREFIX}${verified.token}`);
  });
});
