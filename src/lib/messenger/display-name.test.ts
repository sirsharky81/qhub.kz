import { describe, expect, it } from "vitest";
import { MAX_DISPLAY_NAME_LENGTH } from "./constants";
import { normalizeDisplayName } from "./display-name";

describe("normalizeDisplayName", () => {
  it("trims and collapses spaces", () => {
    expect(normalizeDisplayName("  Алихан   Бек  ")).toBe("Алихан Бек");
  });

  it("caps length", () => {
    const raw = "а".repeat(MAX_DISPLAY_NAME_LENGTH + 8);
    expect(normalizeDisplayName(raw)).toHaveLength(MAX_DISPLAY_NAME_LENGTH);
  });
});
