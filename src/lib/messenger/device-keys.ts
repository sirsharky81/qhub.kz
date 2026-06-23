import { publishPublicKey } from "./client";
import { exportPublicKeyJwk, getOrCreateDeviceKeyPair } from "./crypto";

export async function ensureDeviceKeyPublished(): Promise<void> {
  const pair = await getOrCreateDeviceKeyPair();
  const pubJwk = await exportPublicKeyJwk(pair.publicKey);
  await publishPublicKey(pubJwk);
}
