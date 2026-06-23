import { MESSENGER_SESSION_COOKIE, MESSENGER_SESSION_MAX_AGE_SEC } from "./constants";

function sessionSecret(): string {
  const fromEnv = process.env.MESSENGER_SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    console.warn("[messenger] MESSENGER_SESSION_SECRET not set — using insecure fallback");
  }
  return "qhub-dev-messenger-session-secret-change-me";
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  return atob(base64 + pad);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function signPayload(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(sig));
}

export async function createMessengerSessionToken(phone: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + MESSENGER_SESSION_MAX_AGE_SEC;
  const payload = `${phone}|${exp}`;
  const sig = await signPayload(payload);
  return `${toBase64Url(new TextEncoder().encode(payload))}.${sig}`;
}

export async function verifyMessengerSessionToken(
  token: string,
): Promise<{ phone: string } | null> {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;

    const payload = fromBase64Url(payloadB64);
    const expected = await signPayload(payload);
    if (!timingSafeEqualStr(sig, expected)) return null;

    const [phone, expStr] = payload.split("|");
    const exp = Number(expStr);
    if (!phone || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { phone };
  } catch {
    return null;
  }
}

export function messengerSessionCookieOptions(token: string) {
  return {
    name: MESSENGER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MESSENGER_SESSION_MAX_AGE_SEC,
  };
}

export function clearMessengerSessionCookieOptions() {
  return {
    name: MESSENGER_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
