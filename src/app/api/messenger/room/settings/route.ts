import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { MAX_ROOM_NAME_LENGTH } from "@/lib/messenger/constants";
import { assertMessengerRedisReady } from "@/lib/messenger/redis-health";
import {
  getRoomMeta,
  getRoomParticipants,
  updateRoomSettings,
} from "@/lib/messenger/store";

function roleFor(phone: string, participants: Awaited<ReturnType<typeof getRoomParticipants>>) {
  return participants.find((p) => p.phone === phone)?.role ?? "member";
}

function canManage(actorRole: "owner" | "admin" | "member"): boolean {
  return actorRole === "owner" || actorRole === "admin";
}

export async function PATCH(request: Request) {
  try {
    const redisReady = await assertMessengerRedisReady();
    if (!redisReady.ok) return NextResponse.json({ error: redisReady.error }, { status: 503 });
    const { phone } = await assertMessengerSession();
    let body: { roomId?: string; name?: string | null };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }
    const roomId = (body.roomId ?? "").toUpperCase();
    if (!roomId) return NextResponse.json({ error: "Укажите roomId" }, { status: 400 });

    const meta = await getRoomMeta(roomId);
    if (!meta) return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    const participants = await getRoomParticipants(roomId);
    const actorRole = phone === meta.createdBy ? "owner" : roleFor(phone, participants);
    const actorIsMember = participants.some((p) => p.phone === phone) || phone === meta.createdBy;
    if (!actorIsMember || !canManage(actorRole)) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    if (body.name !== undefined && typeof body.name === "string" && body.name.length > MAX_ROOM_NAME_LENGTH * 2) {
      return NextResponse.json({ error: "Слишком длинное имя" }, { status: 400 });
    }

    const updated = await updateRoomSettings(roomId, {
      name: body.name !== undefined ? body.name : undefined,
    });
    if (!updated) return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });

    return NextResponse.json({
      ok: true,
      roomId,
      name: updated.name ?? null,
      avatarUrl: updated.avatarUrl ?? null,
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}
