import { normalizeKzPhone } from "@/lib/messenger/phone";
import { getMessengerSession } from "@/lib/messenger/session";
import { isPhoneWhitelisted } from "@/lib/messenger/store";

export async function getWhitelistedMessengerPhoneFromRequest(): Promise<string | null> {
  const session = await getMessengerSession();
  if (!session?.phone) return null;
  const phone = normalizeKzPhone(session.phone);
  if (!phone) return null;
  const whitelisted = await isPhoneWhitelisted(phone);
  return whitelisted ? phone : null;
}
