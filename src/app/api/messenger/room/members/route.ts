import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { getRoomMeta, joinRoomParticipant, leaveRoom } from "@/lib/messenger/store";

export async function POST(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    let body: { roomId?: string; action?: "join" | "leave" };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const roomId = (body.roomId ?? "").toUpperCase();
    const action = body.action ?? "join";
    if (!roomId) {
      return NextResponse.json({ error: "Укажите roomId" }, { status: 400 });
    }

    const meta = await getRoomMeta(roomId);
    if (!meta && action === "join") {
      return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    }

    if (action === "leave") {
      const deleted = await leaveRoom(roomId, phone);
      return NextResponse.json({ ok: true, deleted });
    }

    const participants = await joinRoomParticipant(roomId, phone);
    return NextResponse.json({
      ok: true,
      roomId,
      channel: `room:${roomId}`,
      participants,
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}
