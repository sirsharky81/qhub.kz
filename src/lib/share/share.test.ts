import { describe, expect, it } from "vitest";
import { generateRoomCode, normalizeInviteToken, normalizeRoomCodeInput } from "./room-codes";
import { generateInviteToken, generateUuidV7, hashToken } from "./tokens";
import { isShareInviteUrl, parseShareInviteFromUrl } from "./urls";

describe("share room codes", () => {
  it("generates alphanumeric or word codes", () => {
    const code = generateRoomCode();
    expect(code.length).toBeGreaterThan(5);
    expect(code).toMatch(/^[\w-]+$/);
  });

  it("normalizes room code input", () => {
    expect(normalizeRoomCodeInput(" K8QX-3M7N ")).toBe("k8qx-3m7n");
    expect(normalizeRoomCodeInput("Forest-River-27")).toBe("forest-river-27");
  });
});

describe("share tokens", () => {
  it("generates uuid v7 format", () => {
    const id = generateUuidV7();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("generates 128-bit invite token", () => {
    const token = generateInviteToken();
    expect(token).toHaveLength(32);
    expect(hashToken(token)).toHaveLength(64);
  });

  it("normalizes invite token", () => {
    expect(normalizeInviteToken(" ABCD1234 ")).toBe("abcd1234");
  });
});

describe("share urls", () => {
  it("parses invite url", () => {
    const token = "a".repeat(32);
    expect(parseShareInviteFromUrl(`https://qhub.kz/share?t=${token}`)).toBe(token);
    expect(isShareInviteUrl(`https://qhub.kz/share?t=${token}`)).toBe(true);
    expect(isShareInviteUrl("https://qhub.kz/messenger?t=abc")).toBe(false);
  });
});
