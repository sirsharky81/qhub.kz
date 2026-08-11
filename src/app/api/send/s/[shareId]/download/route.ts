import { NextResponse } from "next/server";
import {
  getSendTransfer,
  purgeSendTransfer,
  recordSendDownload,
  verifySendPassword,
} from "@/lib/send/store";
import { openSendFileStream } from "@/lib/send/storage";
import { checkSendDownloadRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await context.params;
  const id = shareId?.trim();
  if (!id) {
    return NextResponse.json({ error: "Неверная ссылка" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkSendDownloadRateLimit(`dl:${id}:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Слишком много запросов" },
      {
        status: 429,
        headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined,
      },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = body.password?.trim() ?? "";
  } catch {
    password = "";
  }

  const transfer = await getSendTransfer(id);
  if (!transfer) {
    return NextResponse.json({ error: "Ссылка не найдена или истекла" }, { status: 404 });
  }

  if (transfer.revoked) {
    return NextResponse.json({ error: "Ссылка отозвана" }, { status: 410 });
  }

  if (transfer.expiresAt <= Date.now()) {
    await purgeSendTransfer(transfer);
    return NextResponse.json({ error: "Ссылка истекла" }, { status: 410 });
  }

  if (transfer.maxDownloads !== null && transfer.downloadCount >= transfer.maxDownloads) {
    await purgeSendTransfer(transfer);
    return NextResponse.json({ error: "Ссылка уже использована" }, { status: 410 });
  }

  if (transfer.passwordHash) {
    if (!password) {
      return NextResponse.json({ error: "Требуется пароль", needsPassword: true }, { status: 401 });
    }
    const ok = await verifySendPassword(transfer, password);
    if (!ok) {
      return NextResponse.json({ error: "Неверный пароль" }, { status: 403 });
    }
  }

  const recorded = await recordSendDownload(transfer);
  if (!recorded.ok) {
    return NextResponse.json({ error: recorded.reason }, { status: 410 });
  }

  try {
    const { stream, sizeBytes } = await openSendFileStream(transfer.filePath);
    const headers = new Headers({
      "Content-Type": transfer.mime,
      "Content-Disposition": `attachment; filename="${transfer.filename.replace(/["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(transfer.filename)}`,
      "Cache-Control": "private, no-store",
    });
    const size = sizeBytes ?? transfer.sizeBytes;
    if (size > 0) headers.set("Content-Length", String(size));

    return new Response(stream, { status: 200, headers });
  } catch (err) {
    console.error("[send-download]", err);
    return NextResponse.json({ error: "Файл недоступен" }, { status: 503 });
  }
}
