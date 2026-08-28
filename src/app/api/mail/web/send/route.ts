import { NextResponse } from "next/server";
import { isMailServerConfigured } from "@/lib/mail/env";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from "@/lib/mail/web/constants";
import { getMailSession } from "@/lib/mail/web/session";
import { sendMailMessage } from "@/lib/mail/web/smtp";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!isMailServerConfigured()) {
    return NextResponse.json({ error: "Почта не настроена" }, { status: 503 });
  }

  const session = await getMailSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const limited = await checkRateLimit("qhub:mail-web", getClientIp(request));
  if (!limited.allowed) {
    return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  const to = String(form.get("to") ?? "").trim();
  const cc = String(form.get("cc") ?? "").trim();
  const bcc = String(form.get("bcc") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim();
  const text = String(form.get("text") ?? "").trim();

  if (!to) {
    return NextResponse.json({ error: "Укажите получателя" }, { status: 400 });
  }

  const files = form.getAll("attachments").filter((item): item is File => item instanceof File);
  if (files.length > MAX_ATTACHMENTS) {
    return NextResponse.json({ error: `Не более ${MAX_ATTACHMENTS} вложений` }, { status: 400 });
  }

  const attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [];
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: "Файл слишком большой (макс. 25 МБ)" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    attachments.push({
      filename: file.name,
      content: buffer,
      contentType: file.type || undefined,
    });
  }

  try {
    await sendMailMessage({
      email: session.email,
      password: session.password,
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject,
      text,
      attachments: attachments.length ? attachments : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Не удалось отправить";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
