import { NextResponse } from "next/server";
import { jsonAuthError } from "@/lib/messenger/guard";
import { assertSendAccess } from "@/lib/send/access";
import { isSendStorageConfigured } from "@/lib/send/config";
import { revokeSendTransfer } from "@/lib/send/store";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ shareId: string }> },
) {
  try {
    if (!isSendStorageConfigured()) {
      return NextResponse.json({ error: "QHub Send не настроен" }, { status: 503 });
    }
    const { shareId } = await context.params;
    const id = shareId?.trim();
    if (!id) {
      return NextResponse.json({ error: "Неверная ссылка" }, { status: 400 });
    }

    const { phone } = await assertSendAccess();
    const ok = await revokeSendTransfer(phone, id);
    if (!ok) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonAuthError(err);
  }
}
