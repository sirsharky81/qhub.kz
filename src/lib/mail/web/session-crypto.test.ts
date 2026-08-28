import { describe, expect, it } from "vitest";
import { createMailSessionToken, verifyMailSessionToken } from "./session-crypto";

describe("mail session crypto", () => {
  it("round-trips email and password", async () => {
    const token = await createMailSessionToken("user@qhub.kz", "secret-pass");
    const session = await verifyMailSessionToken(token);
    expect(session).toEqual({ email: "user@qhub.kz", password: "secret-pass" });
  });

  it("rejects tampered token", async () => {
    const token = await createMailSessionToken("user@qhub.kz", "secret-pass");
    const session = await verifyMailSessionToken(`${token}x`);
    expect(session).toBeNull();
  });
});
