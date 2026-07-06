import { NextResponse } from "next/server";
import { assertChannelParticipant, assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { trackMessengerApiRequest } from "@/lib/messenger/metrics";
import { markRoomDialogRead } from "@/lib/messenger/store";

export async function POST(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const body = (await request.json().catch(() => ({}))) as { roomId?: string; channel?: string };
    const roomIdRaw =
      typeof body.roomId === "string"
        ? body.roomId
        : typeof body.channel === "string" && body.channel.startsWith("room:")
          ? body.channel.slice(5)
          : "";
    const roomId = roomIdRaw.toUpperCase();
    if (!roomId) {
      void trackMessengerApiRequest("room_read", 400);
      return NextResponse.json({ error: "Укажите roomId или room channel" }, { status: 400 });
    }
    const channel = `room:${roomId}`;
    await assertChannelParticipant(phone, channel);
    await markRoomDialogRead(phone, roomId);
    void trackMessengerApiRequest("room_read", 200);
    return NextResponse.json({ ok: true, roomId });
  } catch (err) {
    const res = jsonAuthError(err);
    void trackMessengerApiRequest("room_read", res.status);
    return res;
  }
}
