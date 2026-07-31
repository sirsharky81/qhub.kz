import { describe, expect, it } from "vitest";
import { looksLikeShareInvite, resolveShareJoinInput } from "./join-input";

describe("share join input", () => {
  it("resolves invite url to token", () => {
    const token = "a".repeat(32);
    expect(resolveShareJoinInput(`https://qhub.kz/share?t=${token}`)).toBe(token);
  });

  it("normalizes room code", () => {
    expect(resolveShareJoinInput("  Breeze-Galaxy-73 ")).toBe("breeze-galaxy-73");
  });

  it("detects joinable values", () => {
    expect(looksLikeShareInvite("forest-river-42")).toBe(true);
    expect(looksLikeShareInvite("")).toBe(false);
    expect(looksLikeShareInvite("ab")).toBe(false);
  });
});
