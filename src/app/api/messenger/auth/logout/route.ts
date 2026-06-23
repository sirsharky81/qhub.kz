import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearMessengerSessionCookieOptions } from "@/lib/messenger/session";

export async function DELETE() {
  const jar = await cookies();
  jar.set(clearMessengerSessionCookieOptions());
  return NextResponse.json({ ok: true });
}
