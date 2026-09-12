import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearMailSessionCookieOptions, getMailSession } from "@/lib/mail/web/session";

export async function GET() {
  const session = await getMailSession();
  if (!session) {
    return NextResponse.json({ loggedIn: false });
  }
  return NextResponse.json({ loggedIn: true, email: session.email });
}

export async function POST() {
  const jar = await cookies();
  jar.set(clearMailSessionCookieOptions());
  return NextResponse.json({ ok: true });
}
