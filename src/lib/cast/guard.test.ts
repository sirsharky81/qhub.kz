import { describe, expect, it } from "vitest";
import {
  assertDirectMediaUrl,
  assertNotYoutube,
  CastGuardError,
  detectContentTypeFromUrl,
  isYoutubeUrl,
  looksLikeDirectMediaUrl,
} from "./guard";

describe("cast guard", () => {
  it("detects youtube urls", () => {
    expect(isYoutubeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isYoutubeUrl("https://youtu.be/abc")).toBe(true);
    expect(isYoutubeUrl("https://example.com/v.mp4")).toBe(false);
  });

  it("blocks youtube in assertNotYoutube", () => {
    expect(() => assertNotYoutube("https://youtu.be/x")).toThrow(CastGuardError);
  });

  it("detects content types", () => {
    expect(detectContentTypeFromUrl("https://cdn.test/a.m3u8")).toBe("application/x-mpegURL");
    expect(detectContentTypeFromUrl("https://cdn.test/a.mp4")).toBe("video/mp4");
  });

  it("accepts direct https media urls", () => {
    expect(looksLikeDirectMediaUrl("https://x.com/v.m3u8")).toBe(true);
    expect(assertDirectMediaUrl("https://x.com/v.mp4")).toBe("video/mp4");
  });

  it("rejects non-media urls", () => {
    expect(() => assertDirectMediaUrl("https://example.com/page")).toThrow(CastGuardError);
    expect(() => assertDirectMediaUrl("http://example.com/v.mp4")).toThrow(CastGuardError);
  });
});
