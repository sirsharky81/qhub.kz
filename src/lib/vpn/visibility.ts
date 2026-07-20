import { isAdminAuthenticated } from "@/lib/admin/session";
import { normalizeKzPhone } from "@/lib/messenger/phone";
import { getMessengerSession } from "@/lib/messenger/session";
import { isPhoneWhitelisted } from "@/lib/messenger/store";
import { isVpnEnabledForPhone } from "./store";

/** Карточка VPN на главной и прямой доступ — только admin или whitelist + vpnEnabled. */
export async function canViewerSeeVpnApp(isAdmin?: boolean): Promise<boolean> {
  const admin = isAdmin ?? (await isAdminAuthenticated());
  if (admin) return true;

  const session = await getMessengerSession();
  if (!session) return false;

  const phone = normalizeKzPhone(session.phone);
  if (!(await isPhoneWhitelisted(phone))) return false;
  return isVpnEnabledForPhone(phone);
}
