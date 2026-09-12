import { NextResponse } from "next/server";
import {
  MAX_MAIL_FULL_NAME_LENGTH,
  MAX_MAIL_PHONE_LENGTH,
  MAX_MAIL_SIGNATURE_LENGTH,
} from "@/lib/mail/web/profile-utils";
import { getMailProfile, saveMailProfile } from "@/lib/mail/web/profile-store";
import { getMailSession } from "@/lib/mail/web/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET() {
  const session = await getMailSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const profile = await getMailProfile(session.email);
  return NextResponse.json({
    email: session.email,
    fullName: profile?.fullName ?? "",
    phone: profile?.phone ?? "",
    signature: profile?.signature ?? "",
    updatedAt: profile?.updatedAt ?? null,
  });
}

export async function PATCH(request: Request) {
  const session = await getMailSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const limited = await checkRateLimit("qhub:mail-web", getClientIp(request));
  if (!limited.allowed) {
    return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  }

  let body: { fullName?: string; phone?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  const prev = await getMailProfile(session.email);
  const profile = {
    email: session.email,
    fullName: String(body.fullName ?? prev?.fullName ?? "")
      .trim()
      .slice(0, MAX_MAIL_FULL_NAME_LENGTH),
    phone: String(body.phone ?? prev?.phone ?? "")
      .trim()
      .slice(0, MAX_MAIL_PHONE_LENGTH),
    signature: String(body.signature ?? prev?.signature ?? "").slice(0, MAX_MAIL_SIGNATURE_LENGTH),
    updatedAt: Date.now(),
  };

  await saveMailProfile(profile);
  return NextResponse.json(profile);
}
