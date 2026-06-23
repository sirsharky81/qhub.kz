import { NextResponse } from "next/server";
import { generateRoomCode } from "@/lib/messenger/codes";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { createRoomMeta, getRoomMeta, getRoomParticipants } from "@/lib/messenger/store";

export async function POST() {
  try {
    const { phone } = await assertMessengerSession();

    let roomId = generateRoomCode();
    for (let i = 0; i < 10; i++) {
      const existing = await getRoomMeta(roomId);
      if (!existing) break;
      roomId = generateRoomCode();
    }

    const meta = await createRoomMeta(roomId, phone);
    return NextResponse.json({ roomId, channel: `room:${roomId}`, meta });
  } catch (err) {
    return jsonAuthError(err);
  }
}

export async function GET(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const url = new URL(request.url);
    const roomId = (url.searchParams.get("roomId") ?? "").toUpperCase();
    if (!roomId) {
      return NextResponse.json({ error: "Укажите roomId" }, { status: 400 });
    }
    const meta = await getRoomMeta(roomId);
    if (!meta) {
      return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    }
    const participants = await getRoomParticipants(roomId);
    const isMember = participants.some((p) => p.phone === phone);
    const otherCount = participants.filter((p) => p.phone !== phone).length;
    return NextResponse.json({
      roomId,
      channel: `room:${roomId}`,
      meta,
      participantCount: participants.length,
      isMember,
      otherCount,
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}
