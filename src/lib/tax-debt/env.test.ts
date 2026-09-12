import { describe, expect, it } from "vitest";
import { assignKgdTokens } from "./env";

describe("assignKgdTokens", () => {
  it("puts UUID into X-Portal-Token even if env vars are swapped", () => {
    const assigned = assignKgdTokens(
      "aa".repeat(16),
      "11111111-2222-3333-4444-555555555555",
    );
    expect(assigned.portalToken).toBe("11111111-2222-3333-4444-555555555555");
    expect(assigned.personalAccountToken).toBe("aa".repeat(16));
  });
});
