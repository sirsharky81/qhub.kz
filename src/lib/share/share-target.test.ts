import { describe, expect, it } from "vitest";
import {
  formatPendingTextAsBody,
  parseShareTargetParams,
} from "./pending-payload";
import { detectTextKind, isLikelyUrl, utf8ByteLength } from "./text-utils";

describe("share pending payload", () => {
  it("formats share target text fields", () => {
    expect(
      formatPendingTextAsBody({
        title: "Заголовок",
        text: "Описание",
        url: "https://example.com",
      }),
    ).toBe("Заголовок\n\nОписание\n\nhttps://example.com");
  });

  it("parses share target params", () => {
    expect(parseShareTargetParams({ title: "Hi", text: null, url: null })).toEqual({ title: "Hi" });
    expect(parseShareTargetParams({ title: "", text: "", url: "" })).toBeNull();
  });
});

describe("share text utils", () => {
  it("detects links", () => {
    expect(isLikelyUrl("https://qhub.kz/share")).toBe(true);
    expect(isLikelyUrl("not a url")).toBe(false);
    expect(detectTextKind("https://example.com/page")).toBe("link");
    expect(detectTextKind("hello\nworld")).toBe("text");
  });

  it("measures utf8 byte length", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("привет")).toBe(12);
  });
});
