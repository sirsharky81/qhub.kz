import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { getRoomMeta, getRoomParticipants, joinRoomParticipant, leaveRoom } from "@/lib/messenger/store";
import { assertMessengerRedisReady } from "@/lib/messenger/redis-health";
import { MESSENGER_ROOM_MAX_PARTICIPANTS } from "@/lib/messenger/constants";

function roomStorageUnavailable(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 503 });
}

export async function POST(request: Request) {
  try {
    const redisReady = await assertMessengerRedisReady();
    if (!redisReady.ok) return roomStorageUnavailable(redisReady.error);
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

    if (action === "leave") {
      const deleted = await leaveRoom(roomId, phone);
      return NextResponse.json({ ok: true, deleted });
    }

    const meta = await getRoomMeta(roomId);
    if (!meta) {
      return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    }

    const participants = await getRoomParticipants(roomId);
    const alreadyInRoom = participants.some((p) => p.phone === phone);
    if (!alreadyInRoom && participants.length >= MESSENGER_ROOM_MAX_PARTICIPANTS) {
      return NextResponse.json(
        { error: `Комната заполнена (лимит ${MESSENGER_ROOM_MAX_PARTICIPANTS} участников)` },
        { status: 409 },
      );
    }

    const nextParticipants = await joinRoomParticipant(roomId, phone);
    return NextResponse.json({
      ok: true,
      roomId,
      channel: `room:${roomId}`,
      participants: nextParticipants,
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}
