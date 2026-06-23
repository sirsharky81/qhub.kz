import { NextResponse } from "next/server";
import { checkMessengerRateLimit, getClientIp } from "@/lib/rate-limit";
import { getPinStatus } from "@/lib/messenger/auth-service";
import { ACCESS_DENIED_MSG, assertWhitelistedPhone, jsonAuthError, MessengerAuthError } from "@/lib/messenger/guard";
import { maskPhone } from "@/lib/messenger/phone-format";
import { isValidKzPhone, normalizeKzPhone } from "@/lib/messenger/phone";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkMessengerRateLimit(`identify:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "Слишком много запросов" },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
    );
  }

  let body: { phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: ACCESS_DENIED_MSG }, { status: 403 });
  }

  const raw = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!raw || !isValidKzPhone(normalizeKzPhone(raw))) {
    return NextResponse.json({ ok: false, error: ACCESS_DENIED_MSG }, { status: 403 });
  }

  try {
    const { phone } = await assertWhitelistedPhone(raw);
    const pinStatus = await getPinStatus(phone);
    return NextResponse.json({
      ok: true,
      phone,
      maskedPhone: maskPhone(phone),
      passwordSet: pinStatus.passwordSet,
      mustChangePin: pinStatus.mustChangePin,
      lockedUntil: pinStatus.lockedUntil,
    });
  } catch (err) {
    if (err instanceof MessengerAuthError) {
      return NextResponse.json({ ok: false, error: ACCESS_DENIED_MSG }, { status: 403 });
    }
    return jsonAuthError(err);
  }
}
