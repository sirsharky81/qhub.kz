import { describe, expect, it, vi } from "vitest";
import { getPublicOrigin } from "./public-origin";

function req(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers: new Headers(headers) });
}

describe("getPublicOrigin", () => {
  it("uses Host header when request URL is localhost (nginx → node)", () => {
    const origin = getPublicOrigin(
      req("http://127.0.0.1:3000/api/send/create", {
        host: "www.qhub.kz",
        "x-forwarded-proto": "https",
      }),
    );
    expect(origin).toBe("https://www.qhub.kz");
  });

  it("uses x-forwarded-host when present", () => {
    const origin = getPublicOrigin(
      req("http://127.0.0.1:3000/api/send/create", {
        "x-forwarded-host": "qhub.kz",
        "x-forwarded-proto": "https",
      }),
    );
    expect(origin).toBe("https://qhub.kz");
  });

  it("falls back to default for localhost without proxy headers", () => {
    vi.stubEnv("NODE_ENV", "production");
    const origin = getPublicOrigin(req("http://localhost:3000/api/send/create"));
    expect(origin).toBe("https://www.qhub.kz");
    vi.unstubAllEnvs();
  });
});
