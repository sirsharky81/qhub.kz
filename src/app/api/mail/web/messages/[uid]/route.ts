import { NextResponse } from "next/server";
import { isMailServerConfigured } from "@/lib/mail/env";
import { fetchMailMessage, updateMailMessage } from "@/lib/mail/web/imap";
import { getMailSession } from "@/lib/mail/web/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ uid: string }> };

export async function GET(request: Request, context: RouteContext) {
  if (!isMailServerConfigured()) {
    return NextResponse.json({ error: "Почта не настроена" }, { status: 503 });
  }

  const session = await getMailSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { uid: uidRaw } = await context.params;
  const uid = Number(uidRaw);
  if (!Number.isFinite(uid)) {
    return NextResponse.json({ error: "Неверный идентификатор" }, { status: 400 });
  }

  const folder = new URL(request.url).searchParams.get("folder") || "INBOX";

  try {
    const message = await fetchMailMessage(session.email, session.password, folder, uid);
    if (!message) {
      return NextResponse.json({ error: "Письмо не найдено" }, { status: 404 });
    }
    if (message.unread) {
      await updateMailMessage(session.email, session.password, folder, uid, "read").catch(() => {});
      message.unread = false;
    }
    return NextResponse.json({ message });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка IMAP";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
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

  const { uid: uidRaw } = await context.params;
  const uid = Number(uidRaw);
  if (!Number.isFinite(uid)) {
    return NextResponse.json({ error: "Неверный идентификатор" }, { status: 400 });
  }

  let body: { folder?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  const folder = typeof body.folder === "string" ? body.folder : "INBOX";
  const action = body.action;
  if (!action || !["read", "unread", "flag", "unflag", "delete"].includes(action)) {
    return NextResponse.json({ error: "Неверное действие" }, { status: 400 });
  }

  try {
    await updateMailMessage(
      session.email,
      session.password,
      folder,
      uid,
      action as "read" | "unread" | "flag" | "unflag" | "delete",
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка IMAP";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
