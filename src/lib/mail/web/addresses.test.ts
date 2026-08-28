import { describe, expect, it } from "vitest";
import { isSameMailbox, normalizeMailAddress } from "./addresses";

describe("mail addresses", () => {
  it("normalizes display addresses", () => {
    expect(normalizeMailAddress("Boris <boris@qhub.kz>")).toBe("boris@qhub.kz");
    expect(normalizeMailAddress("boris@qhub.kz")).toBe("boris@qhub.kz");
  });

  it("compares mailboxes case-insensitively", () => {
    expect(isSameMailbox("Boris <boris@qhub.kz>", "boris@qhub.kz")).toBe(true);
  });
});
