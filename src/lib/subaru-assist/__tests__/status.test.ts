import { describe, expect, it } from "vitest";
import { ASSIST_STATUS_TEXT, assistStatusText, isAssistStatusCode } from "../status";

describe("subaru assist status phrases", () => {
  it("keeps client phrases free of hex and DID names", () => {
    for (const [code, text] of Object.entries(ASSIST_STATUS_TEXT)) {
      expect(isAssistStatusCode(code)).toBe(true);
      expect(assistStatusText(code as keyof typeof ASSIST_STATUS_TEXT)).toBe(text);
      expect(text).not.toMatch(/[0-9A-F]{4,}/);
      expect(text).not.toMatch(/27 |2E |14FFFFFF|DID/i);
    }
  });
});
