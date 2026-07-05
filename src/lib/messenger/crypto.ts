import { DEVICE_KEY_STORAGE } from "./constants";
import { deriveDmChatId } from "./phone";

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function getOrCreateDeviceKeyPair(): Promise<CryptoKeyPair> {
  if (typeof window === "undefined") {
    throw new Error("Device keys only on client");
  }
  const stored = localStorage.getItem(DEVICE_KEY_STORAGE);
  if (stored) {
    const privateJwk = JSON.parse(stored) as JsonWebKey;
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      privateJwk,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"],
    );
    const publicJwk: JsonWebKey = {
      kty: privateJwk.kty,
      crv: privateJwk.crv,
      x: privateJwk.x,
      y: privateJwk.y,
    };
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      [],
    );
    return { privateKey, publicKey };
  }

  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  localStorage.setItem(DEVICE_KEY_STORAGE, JSON.stringify(privateJwk));
  return pair;
}

/** Public ECDH key — intentionally public, safe to store on server. */
export async function exportPublicKeyJwk(publicKey: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  return JSON.stringify(jwk);
}

export async function importPublicKeyJwk(jwkStr: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkStr) as JsonWebKey;
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

async function deriveAesKey(privateKey: CryptoKey, publicKey: CryptoKey, info: string): Promise<CryptoKey> {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function deriveDmAesKey(
  privateKey: CryptoKey,
  peerPublicKeyJwk: string,
  myPhone: string,
  peerPhone: string,
): Promise<CryptoKey> {
  const peerKey = await importPublicKeyJwk(peerPublicKeyJwk);
  const chatId = deriveDmChatId(myPhone, peerPhone);
  return deriveAesKey(privateKey, peerKey, chatId);
}

export async function generateRoomAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/** Deterministic room key from short room code (UX-first fallback: no long token needed). */
export async function deriveRoomAesKeyFromCode(roomId: string): Promise<CryptoKey> {
  const normalized = roomId.trim().toUpperCase();
  const material = new TextEncoder().encode(`qhub-room:${normalized}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportRoomKeyBase64Url(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return toBase64Url(raw);
}

export async function importRoomKeyBase64Url(encoded: string): Promise<CryptoKey> {
  const raw = new Uint8Array(fromBase64Url(encoded));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export interface PlainMessage {
  text?: string;
  data?: string;
  mime?: string;
  filename?: string;
  durationMs?: number;
  waveformPeaks?: number[];
  quotedMessageId?: string;
  quotedAuthor?: string;
  quotedText?: string;
}

export async function encryptMessage(
  key: CryptoKey,
  plain: PlainMessage,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(plain));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return { ciphertext: toBase64Url(cipherBuf), iv: toBase64Url(iv.buffer) };
}

export async function decryptMessage(
  key: CryptoKey,
  ciphertext: string,
  iv: string,
): Promise<PlainMessage> {
  const ivArr = new Uint8Array(fromBase64Url(iv));
  const cipherArr = new Uint8Array(fromBase64Url(ciphertext));
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivArr }, key, cipherArr);
  return JSON.parse(new TextDecoder().decode(plainBuf)) as PlainMessage;
}

export async function encryptForStorage(
  key: CryptoKey,
  plain: PlainMessage,
): Promise<{ ciphertext: string; iv: string }> {
  return encryptMessage(key, plain);
}

export async function decryptFromStorage(
  key: CryptoKey,
  ciphertext: string,
  iv: string,
): Promise<PlainMessage> {
  return decryptMessage(key, ciphertext, iv);
}

export function buildRoomJoinUrl(roomId: string, keyBase64Url: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "https://qhub.kz");
  return `${base}/tools/messenger/room/join?code=${encodeURIComponent(roomId)}#key=${encodeURIComponent(keyBase64Url)}`;
}

export function parseRoomJoinUrl(url: string): { code: string; key: string | null } {
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "https://qhub.kz");
    const code = u.searchParams.get("code") ?? "";
    const hashKey = u.hash.startsWith("#key=") ? decodeURIComponent(u.hash.slice(5)) : null;
    return { code, key: hashKey };
  } catch {
    return { code: "", key: null };
  }
}
