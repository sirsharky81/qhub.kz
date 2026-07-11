import { NextResponse } from "next/server";
import { assertChannelParticipant, assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { hideDialogForUser } from "@/lib/messenger/store";

export async function DELETE(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const body = (await request.json().catch(() => ({}))) as { dialogId?: string };
    const dialogId = typeof body.dialogId === "string" ? body.dialogId.trim() : "";
    if (!(dialogId.startsWith("dm:") || dialogId.startsWith("room:"))) {
      return NextResponse.json({ error: "Укажите корректный dialogId" }, { status: 400 });
    }

    await assertChannelParticipant(phone, dialogId);
    await hideDialogForUser(phone, dialogId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonAuthError(err);
  }
}
