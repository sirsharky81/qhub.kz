import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { assertTurnstile } from "@/lib/captcha/turnstile";
import { isValidMailAddress } from "@/lib/mail/exec";
import { getMailConfig, isMailServerConfigured } from "@/lib/mail/env";
import { verifyMailCredentials } from "@/lib/mail/web/imap";
import {
  createMailSessionToken,
  mailSessionCookieOptions,
} from "@/lib/mail/web/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!isMailServerConfigured()) {
    return NextResponse.json({ error: "Почта не настроена" }, { status: 503 });
  }

  const ip = getClientIp(request);
  const limited = await checkRateLimit("qhub:mail-login", ip);
  if (!limited.allowed) {
    return NextResponse.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
  }

  let body: { email?: string; password?: string; captchaToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  const captcha = await assertTurnstile(
    typeof body.captchaToken === "string" ? body.captchaToken : undefined,
    ip,
  );
  if (!captcha.ok) {
    return NextResponse.json({ error: captcha.error }, { status: captcha.status });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const { domain } = getMailConfig();

  if (!email || !password) {
    return NextResponse.json({ error: "Укажите email и пароль" }, { status: 400 });
  }
  if (!isValidMailAddress(email, domain)) {
    return NextResponse.json({ error: `Email должен быть @${domain}` }, { status: 400 });
  }

  const ok = await verifyMailCredentials(email, password);
  if (!ok) {
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  const token = await createMailSessionToken(email, password);
  const jar = await cookies();
  jar.set(mailSessionCookieOptions(token));
  return NextResponse.json({ ok: true, email });
}
