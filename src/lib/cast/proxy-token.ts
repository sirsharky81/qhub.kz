import { randomBytes } from "crypto";
import { CAST_STREAM_TTL_SEC } from "./constants";
import type { CastStreamTokenPayload } from "./types";

let loggedSecretFallback = false;

function castStreamSecret(): string {
  const secret = process.env.CAST_STREAM_SECRET?.trim();
  if (secret) return secret;

  const messengerSecret = process.env.MESSENGER_SESSION_SECRET?.trim();
  if (messengerSecret) {
    if (process.env.NODE_ENV === "production" && !loggedSecretFallback) {
      loggedSecretFallback = true;
      console.warn(
        "[cast] CAST_STREAM_SECRET not set — using MESSENGER_SESSION_SECRET fallback",
      );
    }
    return messengerSecret;
  }

  const adminSecret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (adminSecret) {
    if (process.env.NODE_ENV === "production" && !loggedSecretFallback) {
      loggedSecretFallback = true;
      console.warn("[cast] CAST_STREAM_SECRET not set — using ADMIN_SESSION_SECRET fallback");
    }
    return adminSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("[cast] CAST_STREAM_SECRET is required in production");
  }
  return "qhub-dev-cast-stream-secret-change-me";
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function signPayload(payloadB64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(castStreamSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return toBase64Url(new Uint8Array(sig));
}

export async function signCastStreamToken(
  payload: Omit<CastStreamTokenPayload, "exp" | "streamId"> & {
    exp?: number;
    streamId?: string;
  },
): Promise<string> {
  const full: CastStreamTokenPayload = {
    ...payload,
    exp: payload.exp ?? Math.floor(Date.now() / 1000) + CAST_STREAM_TTL_SEC,
    streamId: payload.streamId ?? randomBytes(12).toString("hex"),
  };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(full)));
  const sig = await signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifyCastStreamToken(token: string): Promise<CastStreamTokenPayload | null> {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;

    const expected = await signPayload(payloadB64);
    if (!timingSafeEqualStr(sig, expected)) return null;

    const payload = JSON.parse(fromBase64Url(payloadB64)) as CastStreamTokenPayload;
    if (!payload?.upstreamKind || !payload.upstreamRef || !payload.contentType || !payload.exp) {
      return null;
    }
    if (!payload.streamId) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
