import { NextResponse } from "next/server";
import { getPinStatus } from "@/lib/messenger/auth-service";
import { getMessengerSession } from "@/lib/messenger/session";
import { isPhoneWhitelisted } from "@/lib/messenger/store";
import { normalizeKzPhone } from "@/lib/messenger/phone";
import { setMessengerGlobalPresence } from "@/lib/messenger/push-store";

const ACCESS_CHECK_TIMEOUT_MS = 3500;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ACCESS_CHECK_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export async function GET() {
  const session = await getMessengerSession();
  if (!session) {
    return NextResponse.json({ allowed: false, messengerLoggedIn: false });
  }

  const phone = normalizeKzPhone(session.phone);
  const whitelisted = await withTimeout(isPhoneWhitelisted(phone), false);
  if (!whitelisted) {
    return NextResponse.json({ allowed: false, messengerLoggedIn: false });
  }

  const pinStatus = await withTimeout(
    getPinStatus(phone),
    { passwordSet: false, mustChangePin: false, lockedUntil: null },
  );
  // Presence update should never block auth/access handshake.
  void setMessengerGlobalPresence(phone).catch(() => {});
  return NextResponse.json({
    allowed: true,
    phone,
    passwordSet: pinStatus.passwordSet,
    mustChangePin: pinStatus.mustChangePin,
    messengerLoggedIn: true,
    lockedUntil: pinStatus.lockedUntil,
  });
}
