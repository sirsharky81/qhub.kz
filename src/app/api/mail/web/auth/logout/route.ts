import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearMailSessionCookieOptions } from "@/lib/mail/web/session";

export async function POST() {
  const jar = await cookies();
  jar.set(clearMailSessionCookieOptions());
  return NextResponse.json({ ok: true });
}
