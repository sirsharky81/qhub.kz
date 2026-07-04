import { NextResponse } from "next/server";
import { assertChannelParticipant, assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { trackMessengerApiRequest } from "@/lib/messenger/metrics";
import { markDmDialogRead } from "@/lib/messenger/store";

export async function POST(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const body = (await request.json().catch(() => ({}))) as { chatId?: string };
    const chatId = typeof body.chatId === "string" ? body.chatId : "";
    if (!chatId.startsWith("dm:")) {
      void trackMessengerApiRequest("dialogs_read", 400);
      return NextResponse.json({ error: "Укажите dm chatId" }, { status: 400 });
    }
    await assertChannelParticipant(phone, chatId);
    await markDmDialogRead(phone, chatId);
    void trackMessengerApiRequest("dialogs_read", 200);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = jsonAuthError(err);
    void trackMessengerApiRequest("dialogs_read", res.status);
    return res;
  }
}
