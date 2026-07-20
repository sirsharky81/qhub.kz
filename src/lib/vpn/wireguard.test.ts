import { describe, expect, it } from "vitest";
import { buildClientConfig, encodeWgKey, generateWireGuardKeyPair } from "./wireguard";

describe("wireguard", () => {
  it("generates valid-looking base64 key pair", () => {
    const pair = generateWireGuardKeyPair();
    expect(pair.privateKey).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(pair.publicKey).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(pair.privateKey).not.toBe(pair.publicKey);
  });

  it("builds client config with full tunnel", () => {
    const config = buildClientConfig({
      privateKey: "priv",
      address: "10.8.0.2",
      dns: "1.1.1.1",
      serverPublicKey: "pub",
      endpoint: "1.2.3.4:51820",
    });
    expect(config).toContain("PrivateKey = priv");
    expect(config).toContain("Address = 10.8.0.2/32");
    expect(config).toContain("AllowedIPs = 0.0.0.0/0, ::/0");
    expect(config).toContain("Endpoint = 1.2.3.4:51820");
  });

  it("encodeWgKey round-trips 32 bytes", () => {
    const bytes = new Uint8Array(32).fill(7);
    expect(encodeWgKey(bytes)).toHaveLength(44);
  });
});
