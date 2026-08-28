import { NextResponse } from "next/server";
import { isMailServerConfigured } from "@/lib/mail/env";
import { listMailFolders } from "@/lib/mail/web/imap";
import { getMailSession } from "@/lib/mail/web/session";

export async function GET() {
  if (!isMailServerConfigured()) {
    return NextResponse.json({ error: "Почта не настроена" }, { status: 503 });
  }

  const session = await getMailSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  try {
    const folders = await listMailFolders(session.email, session.password);
    return NextResponse.json({ folders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка IMAP";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
