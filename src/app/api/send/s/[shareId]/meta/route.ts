import { NextResponse } from "next/server";
import { getSendTransfer, toPublicMeta, purgeSendTransfer } from "@/lib/send/store";
import { checkSendDownloadRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(
  _request: Request,
  context: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await context.params;
  const id = shareId?.trim();
  if (!id) {
    return NextResponse.json({ error: "Неверная ссылка" }, { status: 400 });
  }

  const ip = getClientIp(_request);
  const { allowed, retryAfterSec } = await checkSendDownloadRateLimit(`${id}:${ip}`);
  if (!allowed) {
    return NextResponse.json(
      { error: "Слишком много запросов" },
      {
        status: 429,
        headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined,
      },
    );
  }

  const transfer = await getSendTransfer(id);
  if (!transfer) {
    return NextResponse.json({ error: "Ссылка не найдена или истекла" }, { status: 404 });
  }

  if (transfer.expiresAt <= Date.now()) {
    await purgeSendTransfer(transfer);
    return NextResponse.json({ error: "Ссылка истекла" }, { status: 410 });
  }

  if (transfer.revoked) {
    return NextResponse.json({ error: "Ссылка отозвана" }, { status: 410 });
  }

  if (transfer.maxDownloads !== null && transfer.downloadCount >= transfer.maxDownloads) {
    await purgeSendTransfer(transfer);
    return NextResponse.json({ error: "Ссылка уже использована" }, { status: 410 });
  }

  return NextResponse.json({ meta: toPublicMeta(transfer) });
}
