import { assertMessengerSession, MessengerAuthError } from "@/lib/messenger/guard";
import { getWhitelistEntry } from "@/lib/messenger/store";

export async function assertMusicRemoteAccess(): Promise<{ phone: string }> {
  const { phone } = await assertMessengerSession();
  const entry = await getWhitelistEntry(phone);
  if (!entry || entry.status !== "active" || entry.musicEnabled !== true) {
    throw new MessengerAuthError("Доступ к библиотеке NAS не включён", 403);
  }
  return { phone };
}

export async function isMusicEnabledForPhone(phone: string): Promise<boolean> {
  const entry = await getWhitelistEntry(phone);
  return entry?.status === "active" && entry.musicEnabled === true;
}
