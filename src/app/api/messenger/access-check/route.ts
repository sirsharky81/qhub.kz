import { NextResponse } from "next/server";
import { getPinStatus } from "@/lib/messenger/auth-service";
import { getMessengerSession } from "@/lib/messenger/session";
import { isPhoneWhitelisted } from "@/lib/messenger/store";
import { normalizeKzPhone } from "@/lib/messenger/phone";
import { touchMessengerPresence } from "@/lib/messenger/push-store";

export async function GET() {
  const session = await getMessengerSession();
  if (!session) {
    return NextResponse.json({ allowed: false, messengerLoggedIn: false });
  }

  const phone = normalizeKzPhone(session.phone);
  const whitelisted = await isPhoneWhitelisted(phone);
  if (!whitelisted) {
    return NextResponse.json({ allowed: false, messengerLoggedIn: false });
  }

  const pinStatus = await getPinStatus(phone);
  await touchMessengerPresence(phone);
  return NextResponse.json({
    allowed: true,
    phone,
    passwordSet: pinStatus.passwordSet,
    mustChangePin: pinStatus.mustChangePin,
    messengerLoggedIn: true,
    lockedUntil: pinStatus.lockedUntil,
  });
}
