import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearMessengerSessionCookieOptions, getMessengerSession } from "@/lib/messenger/session";
import { clearMessengerPresence } from "@/lib/messenger/push-store";

export async function DELETE() {
  const session = await getMessengerSession();
  if (session?.phone) {
    await clearMessengerPresence(session.phone);
  }
  const jar = await cookies();
  jar.set(clearMessengerSessionCookieOptions());
  return NextResponse.json({ ok: true });
}
