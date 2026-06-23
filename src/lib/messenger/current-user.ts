import { cookies } from "next/headers";
import { normalizeKzPhone } from "./phone";

export interface QHubUser {
  phone: string;
  displayName?: string;
}

const DEV_PHONE_COOKIE = "qhub_messenger_dev_phone";

/**
 * Returns the current QHub user. Plug in real QHub auth here when ready.
 * Dev: MESSENGER_DEV_PHONE env or qhub_messenger_dev_phone cookie.
 */
export async function getCurrentUser(): Promise<QHubUser | null> {
  // TODO: integrate with QHub session when auth ships
  const jar = await cookies();
  const devCookie = jar.get(DEV_PHONE_COOKIE)?.value;
  const devEnv = process.env.MESSENGER_DEV_PHONE?.trim();

  const raw = devCookie || devEnv;
  if (!raw) return null;

  const phone = normalizeKzPhone(raw);
  return { phone };
}
