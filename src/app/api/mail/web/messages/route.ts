import { NextResponse } from "next/server";
import type { MailFilter } from "@/lib/mail/web/constants";
import { isMailServerConfigured } from "@/lib/mail/env";
import { listMailMessages } from "@/lib/mail/web/imap";
import { getMailSession } from "@/lib/mail/web/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const VALID_FILTERS = new Set<MailFilter>(["all", "unread", "flagged", "attachments"]);

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const folder = url.searchParams.get("folder") || "INBOX";
  const filterRaw = url.searchParams.get("filter") || "all";
  const filter = VALID_FILTERS.has(filterRaw as MailFilter) ? (filterRaw as MailFilter) : "all";
  const q = url.searchParams.get("q") || "";
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));

  try {
    const result = await listMailMessages(session.email, session.password, {
      folder,
      filter,
      q,
      offset,
      limit,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка IMAP";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
