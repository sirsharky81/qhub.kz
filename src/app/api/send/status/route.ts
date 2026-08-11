import { NextResponse } from "next/server";
import { getMessengerSession } from "@/lib/messenger/session";
import { isSendEnabledForPhone } from "@/lib/send/access";
import { isSendEnabled, isSendStorageConfigured } from "@/lib/send/config";
import { probeSendStorage } from "@/lib/send/paths";
import { normalizeKzPhone } from "@/lib/messenger/phone";

export async function GET(request: Request) {
  const configured = isSendStorageConfigured();
  const session = await getMessengerSession();
  let allowed = false;
  let storageProbe: Awaited<ReturnType<typeof probeSendStorage>> | undefined;

  if (configured && session?.phone) {
    const phone = normalizeKzPhone(session.phone);
    allowed = await isSendEnabledForPhone(phone);
    // Probe NAS when user can upload — surfaces connectivity issues before they pick a file.
    if (allowed) {
      storageProbe = await probeSendStorage();
    }
  }

  return NextResponse.json({
    enabled: isSendEnabled(),
    configured,
    allowed,
    loggedIn: Boolean(session?.phone),
    storage: storageProbe,
  });
}
