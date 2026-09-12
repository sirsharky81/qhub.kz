import { MAIL_SESSION_COOKIE, MAIL_SESSION_MAX_AGE_SEC } from "./constants";

let loggedSecretFallback = false;

function sessionSecret(): string {
  const mailSecret = process.env.MAIL_SESSION_SECRET?.trim();
  if (mailSecret) return mailSecret;

  const adminSecret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (adminSecret) {
    if (process.env.NODE_ENV === "production" && !loggedSecretFallback) {
      loggedSecretFallback = true;
      console.warn("[mail] MAIL_SESSION_SECRET not set — using ADMIN_SESSION_SECRET fallback");
    }
    return adminSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("[mail] MAIL_SESSION_SECRET is required in production");
  }
  return "qhub-dev-mail-session-secret-change-me";
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveKey(): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionSecret()));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function createMailSessionToken(email: string, password: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + MAIL_SESSION_MAX_AGE_SEC;
  const payload = JSON.stringify({ email, password, exp });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(payload),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return toBase64Url(combined);
}

export async function verifyMailSessionToken(
  token: string,
): Promise<{ email: string; password: string } | null> {
  try {
    const combined = fromBase64Url(token);
    if (combined.length < 13) return null;
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const key = await deriveKey();
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as {
      email?: string;
      password?: string;
      exp?: number;
    };
    if (
      !parsed.email ||
      typeof parsed.password !== "string" ||
      parsed.exp === undefined ||
      !Number.isFinite(parsed.exp) ||
      parsed.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return { email: parsed.email, password: parsed.password };
  } catch {
    return null;
  }
}

export function mailSessionCookieOptions(token: string) {
  return {
    name: MAIL_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAIL_SESSION_MAX_AGE_SEC,
  };
}

export function clearMailSessionCookieOptions() {
  return {
    name: MAIL_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
