import { cookies } from "next/headers";
import { verifyMailSessionToken } from "./session-crypto";
import { MAIL_SESSION_COOKIE } from "./constants";

export async function getMailSession(): Promise<{ email: string; password: string } | null> {
  const jar = await cookies();
  const token = jar.get(MAIL_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyMailSessionToken(token);
}

export {
  createMailSessionToken,
  mailSessionCookieOptions,
  clearMailSessionCookieOptions,
} from "./session-crypto";
