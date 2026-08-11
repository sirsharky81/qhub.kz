import { NextResponse } from "next/server";
import { getMessengerSession } from "@/lib/messenger/session";
import { isSendEnabledForPhone } from "@/lib/send/access";
import { isSendEnabled, isSendStorageConfigured } from "@/lib/send/config";
import { normalizeKzPhone } from "@/lib/messenger/phone";

export async function GET() {
  const configured = isSendStorageConfigured();
  const session = await getMessengerSession();
  let allowed = false;

  if (configured && session?.phone) {
    const phone = normalizeKzPhone(session.phone);
    allowed = await isSendEnabledForPhone(phone);
  }

  return NextResponse.json({
    enabled: isSendEnabled(),
    configured,
    allowed,
    loggedIn: Boolean(session?.phone),
  });
}
