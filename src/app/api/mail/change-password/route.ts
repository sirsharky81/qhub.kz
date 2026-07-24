import { NextResponse } from "next/server";
import { changeMailboxPassword, isValidMailAddress } from "@/lib/mail/exec";
import { getMailConfig, isMailServerConfigured } from "@/lib/mail/env";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!isMailServerConfigured()) {
    return NextResponse.json({ error: "Почта не настроена" }, { status: 503 });
  }

  const limited = await checkRateLimit("qhub:mail-passwd", getClientIp(request));
  if (!limited.allowed) {
    return NextResponse.json({ error: "Слишком много попыток. Попробуйте позже." }, { status: 429 });
  }

  let body: { email?: string; currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const { domain } = getMailConfig();

  if (!email || !currentPassword || !newPassword) {
    return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
  }
  if (!isValidMailAddress(email, domain)) {
    return NextResponse.json({ error: `Email должен быть @${domain}` }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Новый пароль не короче 8 символов" }, { status: 400 });
  }

  try {
    await changeMailboxPassword(email, newPassword, currentPassword);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сменить пароль";
    const status = /incorrect|неверн/i.test(message) ? 401 : 400;
    return NextResponse.json({ error: "Неверный email или текущий пароль" }, { status });
  }
}
