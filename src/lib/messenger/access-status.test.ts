import { describe, expect, it } from "vitest";
import { MESSENGER_SELF_ADDED_BY } from "./constants";
import {
  isMessengerVerified,
  isWhitelistBlocked,
  messengerOrigin,
  publicWhitelistStatus,
} from "./access-status";

describe("whitelist access status", () => {
  it("treats legacy revoked as blocked", () => {
    expect(isWhitelistBlocked("revoked")).toBe(true);
    expect(isWhitelistBlocked("blocked")).toBe(true);
    expect(isWhitelistBlocked("active")).toBe(false);
    expect(publicWhitelistStatus("revoked")).toBe("blocked");
  });

  it("marks self-registered numbers as verified OTP", () => {
    expect(isMessengerVerified({ addedBy: MESSENGER_SELF_ADDED_BY })).toBe(true);
    expect(messengerOrigin({ addedBy: MESSENGER_SELF_ADDED_BY })).toBe("otp");
  });

  it("keeps admin-added numbers unverified until the flag is set", () => {
    expect(isMessengerVerified({ addedBy: "admin@qhub.kz" })).toBe(false);
    expect(isMessengerVerified({ addedBy: "admin@qhub.kz", verified: true })).toBe(true);
    expect(messengerOrigin({ addedBy: "admin@qhub.kz" })).toBe("admin");
  });
});
