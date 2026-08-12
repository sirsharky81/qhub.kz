import { describe, expect, it } from "vitest";
import { parseSendShareInput } from "./urls";

describe("cast resolve helpers", () => {
  it("parses send share urls", () => {
    expect(parseSendShareInput("https://www.qhub.kz/s/abc12345")).toBe("abc12345");
    expect(parseSendShareInput("/s/abc12345")).toBe("abc12345");
    expect(parseSendShareInput("abc12345")).toBe("abc12345");
  });

  it("returns null for non-send input", () => {
    expect(parseSendShareInput("https://cdn.test/v.m3u8")).toBeNull();
    expect(parseSendShareInput("")).toBeNull();
  });
});
