import { cookies, headers } from "next/headers";
import { MESSENGER_SESSION_COOKIE } from "./constants";
import { verifyMessengerSessionToken } from "./session-crypto";

export async function getMessengerSession(): Promise<{ phone: string } | null> {
  const headerStore = await headers();
  const auth = headerStore.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return verifyMessengerSessionToken(token);
  }

  const jar = await cookies();
  const token = jar.get(MESSENGER_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyMessengerSessionToken(token);
}

export {
  createMessengerSessionToken,
  messengerSessionCookieOptions,
  clearMessengerSessionCookieOptions,
} from "./session-crypto";
