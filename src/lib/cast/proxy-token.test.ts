import { afterEach, describe, expect, it } from "vitest";
import { signCastStreamToken, verifyCastStreamToken } from "./proxy-token";

describe("cast proxy token", () => {
  afterEach(() => {
    delete process.env.CAST_STREAM_SECRET;
  });

  it("signs and verifies payload", async () => {
    const token = await signCastStreamToken({
      upstreamKind: "url",
      upstreamRef: "https://cdn.example.com/a.mp4",
      contentType: "video/mp4",
      title: "Test",
    });
    const payload = await verifyCastStreamToken(token);
    expect(payload?.upstreamKind).toBe("url");
    expect(payload?.upstreamRef).toBe("https://cdn.example.com/a.mp4");
    expect(payload?.contentType).toBe("video/mp4");
  });

  it("rejects tampered token", async () => {
    const token = await signCastStreamToken({
      upstreamKind: "url",
      upstreamRef: "https://cdn.example.com/a.mp4",
      contentType: "video/mp4",
    });
    const [payloadB64, sig] = token.split(".");
    const tampered = `${payloadB64}x.${sig}`;
    expect(await verifyCastStreamToken(tampered)).toBeNull();
  });

  it("rejects expired token", async () => {
    const token = await signCastStreamToken({
      upstreamKind: "url",
      upstreamRef: "https://cdn.example.com/a.mp4",
      contentType: "video/mp4",
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    expect(await verifyCastStreamToken(token)).toBeNull();
  });
});
