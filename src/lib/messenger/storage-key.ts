import { STORAGE_SALT_KEY } from "./constants";

const PBKDF2_ITERATIONS = 310_000;

function getOrCreateSalt(): Uint8Array {
  if (typeof window === "undefined") {
    throw new Error("Storage key only on client");
  }
  const existing = localStorage.getItem(STORAGE_SALT_KEY);
  if (existing) {
    const binary = atob(existing);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const b of salt) binary += String.fromCharCode(b);
  localStorage.setItem(STORAGE_SALT_KEY, btoa(binary));
  return salt;
}

export async function deriveStorageKey(pin: string): Promise<CryptoKey> {
  const salt = getOrCreateSalt();
  const pinKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    pinKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
