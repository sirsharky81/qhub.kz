import { describe, expect, it } from "vitest";
import { assertPublicHttpsUrl, CastAllowlistError } from "./allowlist";

describe("cast allowlist", () => {
  it("allows public https urls", () => {
    const url = assertPublicHttpsUrl("https://cdn.example.com/video.m3u8");
    expect(url.hostname).toBe("cdn.example.com");
  });

  it("blocks localhost", () => {
    expect(() => assertPublicHttpsUrl("https://localhost/v.mp4")).toThrow(CastAllowlistError);
  });

  it("blocks private ipv4", () => {
    expect(() => assertPublicHttpsUrl("https://192.168.1.10/v.mp4")).toThrow(CastAllowlistError);
    expect(() => assertPublicHttpsUrl("https://127.0.0.1/v.mp4")).toThrow(CastAllowlistError);
  });

  it("blocks non-https", () => {
    expect(() => assertPublicHttpsUrl("http://example.com/v.mp4")).toThrow(CastAllowlistError);
  });
});
