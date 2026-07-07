import { createHmac, timingSafeEqual } from "node:crypto";

const MESSENGER_SESSION_COOKIE = "qhub_messenger_session";

function sessionSecret() {
  const messengerSecret = process.env.MESSENGER_SESSION_SECRET?.trim();
  if (messengerSecret) return messengerSecret;
  const adminSecret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (adminSecret) return adminSecret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("[messenger-ws] MESSENGER_SESSION_SECRET is required in production");
  }
  return "qhub-dev-messenger-session-secret-change-me";
}

function fromBase64Url(str) {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  return Buffer.from(base64 + pad, "base64").toString("utf8");
}

function signPayload(payload) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function verifyMessengerSessionToken(token) {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;

    const payload = fromBase64Url(payloadB64);
    const expected = signPayload(payload);
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

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

export function parseCookieToken(cookieHeader) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (name === MESSENGER_SESSION_COOKIE) return decodeURIComponent(value);
  }
  return null;
}

export function parseBearerToken(authHeader) {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export { MESSENGER_SESSION_COOKIE };
