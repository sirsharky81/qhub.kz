import { createPrivateKey, createPublicKey, randomBytes } from "node:crypto";

const X25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b656e04220420", "hex");

function clampPrivateKey(key: Buffer): Buffer {
  key[0] &= 248;
  key[31] &= 127;
  key[31] |= 64;
  return key;
}

export function encodeWgKey(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function generateWireGuardKeyPair(): { privateKey: string; publicKey: string } {
  const rawPrivate = clampPrivateKey(randomBytes(32));
  const pkcs8 = Buffer.concat([X25519_PKCS8_PREFIX, rawPrivate]);
  const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  const spki = publicKey.export({ format: "der", type: "spki" });
  const rawPublic = spki.subarray(-32);
  return {
    privateKey: encodeWgKey(rawPrivate),
    publicKey: encodeWgKey(rawPublic),
  };
}

export function buildClientConfig(input: {
  privateKey: string;
  address: string;
  dns: string;
  serverPublicKey: string;
  endpoint: string;
}): string {
  const lines = [
    "[Interface]",
    `PrivateKey = ${input.privateKey}`,
    `Address = ${input.address}/32`,
    `DNS = ${input.dns}`,
    "",
    "[Peer]",
    `PublicKey = ${input.serverPublicKey}`,
    `Endpoint = ${input.endpoint}`,
    "AllowedIPs = 0.0.0.0/0, ::/0",
    "PersistentKeepalive = 25",
    "",
  ];
  return lines.join("\n");
}
