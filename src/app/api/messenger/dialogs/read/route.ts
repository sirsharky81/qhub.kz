import { NextResponse } from "next/server";
import { assertChannelParticipant, assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { markDmDialogRead } from "@/lib/messenger/store";

export async function POST(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const body = (await request.json().catch(() => ({}))) as { chatId?: string };
    const chatId = typeof body.chatId === "string" ? body.chatId : "";
    if (!chatId.startsWith("dm:")) {
      return NextResponse.json({ error: "Укажите dm chatId" }, { status: 400 });
    }
    await assertChannelParticipant(phone, chatId);
    await markDmDialogRead(phone, chatId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonAuthError(err);
  }
}
