import { describe, expect, it } from "vitest";
import { extractHttpLinks, splitTextWithLinks } from "./linkify";

describe("splitTextWithLinks", () => {
  it("extracts multiple http links and preserves surrounding text", () => {
    const text = "Открой https://example.com/a и www.qhub.kz/tools.";
    const segments = splitTextWithLinks(text);
    expect(segments.map((segment) => segment.value).join("")).toBe(text);
    expect(extractHttpLinks(text)).toEqual([
      "https://example.com/a",
      "https://www.qhub.kz/tools",
    ]);
  });

  it("keeps trailing punctuation outside the link", () => {
    expect(splitTextWithLinks("(https://example.com/path),")).toEqual([
      { kind: "text", value: "(" },
      { kind: "link", value: "https://example.com/path", href: "https://example.com/path" },
      { kind: "text", value: ")," },
    ]);
  });

  it("does not linkify unsafe protocols", () => {
    const text = "javascript:alert(1) data:text/html,test file:///tmp/a";
    expect(splitTextWithLinks(text)).toEqual([{ kind: "text", value: text }]);
    expect(extractHttpLinks(text)).toEqual([]);
  });

  it("preserves unicode and line breaks", () => {
    const text = "Ссылка:\nhttps://пример.рф/путь\nготово";
    expect(splitTextWithLinks(text).map((segment) => segment.value).join("")).toBe(text);
    expect(extractHttpLinks(text)).toHaveLength(1);
  });
});
