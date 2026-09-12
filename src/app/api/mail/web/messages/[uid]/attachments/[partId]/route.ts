import { NextResponse } from "next/server";
import { isMailServerConfigured } from "@/lib/mail/env";
import { fetchMailAttachment } from "@/lib/mail/web/imap";
import { getMailSession } from "@/lib/mail/web/session";

type RouteContext = { params: Promise<{ uid: string; partId: string }> };

export async function GET(request: Request, context: RouteContext) {
  if (!isMailServerConfigured()) {
    return NextResponse.json({ error: "Почта не настроена" }, { status: 503 });
  }

  const session = await getMailSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { uid: uidRaw, partId } = await context.params;
  const uid = Number(uidRaw);
  const partIndex = Number(partId);
  if (!Number.isFinite(uid) || !Number.isFinite(partIndex)) {
    return NextResponse.json({ error: "Неверный идентификатор" }, { status: 400 });
  }

  const folder = new URL(request.url).searchParams.get("folder") || "INBOX";

  try {
    const attachment = await fetchMailAttachment(
      session.email,
      session.password,
      folder,
      uid,
      partIndex,
    );
    if (!attachment) {
      return NextResponse.json({ error: "Вложение не найдено" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(attachment.data), {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка IMAP";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
