import { assertMessengerSession, MessengerAuthError } from "@/lib/messenger/guard";
import { getWhitelistEntry } from "@/lib/messenger/store";

export async function assertSendAccess(): Promise<{ phone: string }> {
  const { phone } = await assertMessengerSession();
  const entry = await getWhitelistEntry(phone);
  if (!entry || entry.status !== "active" || entry.sendEnabled !== true) {
    throw new MessengerAuthError("QHub Send не включён", 403);
  }
  return { phone };
}

export async function isSendEnabledForPhone(phone: string): Promise<boolean> {
  const entry = await getWhitelistEntry(phone);
  return entry?.status === "active" && entry.sendEnabled === true;
}
