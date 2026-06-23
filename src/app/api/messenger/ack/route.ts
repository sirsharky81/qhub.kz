import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { ackDmMessage, ackRoomMessage } from "@/lib/messenger/store";

export async function POST(request: Request) {
  try {
    await assertMessengerSession();
    let body: { channel?: string; messageId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const channel = body.channel ?? "";
    const messageId = body.messageId ?? "";
    if (!channel || !messageId) {
      return NextResponse.json({ error: "Укажите channel и messageId" }, { status: 400 });
    }

    if (channel.startsWith("dm:")) {
      await ackDmMessage(channel, messageId);
    } else if (channel.startsWith("room:")) {
      await ackRoomMessage(channel.slice(5), messageId);
    } else {
      return NextResponse.json({ error: "Неизвестный канал" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonAuthError(err);
  }
}
