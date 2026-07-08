import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { MESSENGER_ROOM_MAX_PARTICIPANTS } from "@/lib/messenger/constants";
import { normalizeKzPhone } from "@/lib/messenger/phone";
import { getMessengerPresence, isMessengerOnline, isViewingChannel } from "@/lib/messenger/push-store";
import { assertMessengerRedisReady } from "@/lib/messenger/redis-health";
import { getAuthRecord, getProfile, isPhoneWhitelisted } from "@/lib/messenger/store";
import {
  addRoomParticipant,
  getRoomMeta,
  getRoomParticipants,
  removeRoomParticipant,
  setRoomParticipantRole,
} from "@/lib/messenger/store";

function roleFor(phone: string, participants: Awaited<ReturnType<typeof getRoomParticipants>>) {
  return participants.find((p) => p.phone === phone)?.role ?? "member";
}

function canManage(actorRole: "owner" | "admin" | "member"): boolean {
  return actorRole === "owner" || actorRole === "admin";
}

export async function GET(request: Request) {
  try {
    const redisReady = await assertMessengerRedisReady();
    if (!redisReady.ok) return NextResponse.json({ error: redisReady.error }, { status: 503 });
    const { phone } = await assertMessengerSession();
    const url = new URL(request.url);
    const roomId = (url.searchParams.get("roomId") ?? "").toUpperCase();
    if (!roomId) return NextResponse.json({ error: "Укажите roomId" }, { status: 400 });
    const meta = await getRoomMeta(roomId);
    if (!meta) return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    const participants = (await getRoomParticipants(roomId)).map((p) =>
      p.phone === meta.createdBy ? { ...p, role: "owner" as const } : p,
    );
    const actorRole =
      phone === meta.createdBy ? "owner" : roleFor(phone, participants);
    const member = participants.some((p) => p.phone === phone) || phone === meta.createdBy;
    if (!member) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
    const roomChannel = `room:${roomId}`;
    const participantsWithPresence = await Promise.all(
      participants.map(async (p) => {
        const presence = await getMessengerPresence(p.phone);
        return {
          ...p,
          online: isMessengerOnline(presence),
          inRoomNow: isViewingChannel(presence, roomChannel),
        };
      }),
    );
    return NextResponse.json({
      roomId,
      ownerPhone: meta.createdBy,
      actorRole,
      name: meta.name ?? null,
      avatarUrl: meta.avatarUrl ?? null,
      roomMaxParticipants: MESSENGER_ROOM_MAX_PARTICIPANTS,
      participants: participantsWithPresence,
    });
  } catch (err) {
    return jsonAuthError(err);
  }
}

export async function POST(request: Request) {
  try {
    const redisReady = await assertMessengerRedisReady();
    if (!redisReady.ok) return NextResponse.json({ error: redisReady.error }, { status: 503 });
    const { phone } = await assertMessengerSession();
    const body = (await request.json().catch(() => null)) as
      | { roomId?: string; action?: "add" | "remove" | "promote" | "demote"; targetPhone?: string }
      | null;
    const roomId = (body?.roomId ?? "").toUpperCase();
    const action = body?.action;
    const targetPhone = normalizeKzPhone(body?.targetPhone ?? "");
    if (!roomId || !action || !targetPhone) {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }
    const meta = await getRoomMeta(roomId);
    if (!meta) return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    const participants = (await getRoomParticipants(roomId)).map((p) =>
      p.phone === meta.createdBy ? { ...p, role: "owner" as const } : p,
    );
    const actorRole =
      phone === meta.createdBy ? "owner" : roleFor(phone, participants);
    const actorIsMember = participants.some((p) => p.phone === phone);
    if (!actorIsMember || !canManage(actorRole)) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }
    const target = participants.find((p) => p.phone === targetPhone);
    const targetRole = target?.role ?? "member";
    const isOwnerTarget = targetPhone === meta.createdBy || targetRole === "owner";
    const isSelfTarget = targetPhone === phone;

    if (action === "add") {
      const whitelisted = await isPhoneWhitelisted(targetPhone);
      if (!whitelisted) {
        return NextResponse.json({ error: "Можно добавить только из whitelist" }, { status: 403 });
      }
      const auth = await getAuthRecord(targetPhone);
      if (!auth) {
        return NextResponse.json(
          { error: "Пользователь не зарегистрирован в мессенджере", code: "not_messenger_user" },
          { status: 409 },
        );
      }
      const targetProfile = await getProfile(targetPhone);
      if (targetProfile?.allowRoomAutoAdd === false) {
        return NextResponse.json(
          {
            error: "У пользователя отключено автодобавление. Отправьте приглашение в личный чат.",
            code: "auto_add_disabled",
          },
          { status: 409 },
        );
      }
      if (!target && participants.length >= MESSENGER_ROOM_MAX_PARTICIPANTS) {
        return NextResponse.json(
          { error: `Комната заполнена (лимит ${MESSENGER_ROOM_MAX_PARTICIPANTS})` },
          { status: 409 },
        );
      }
      const next = await addRoomParticipant(roomId, targetPhone, "member");
      return NextResponse.json({ ok: true, participants: next });
    }

    if (action === "remove") {
      if (isOwnerTarget) return NextResponse.json({ error: "Нельзя удалить создателя комнаты" }, { status: 403 });
      if (isSelfTarget) return NextResponse.json({ error: "Удалите себя через «Выйти»" }, { status: 400 });
      const next = await removeRoomParticipant(roomId, targetPhone);
      return NextResponse.json({ ok: true, participants: next.participants, deletedRoom: next.deletedRoom });
    }

    if (action === "promote") {
      if (isOwnerTarget) return NextResponse.json({ ok: true, participants });
      const next = await setRoomParticipantRole(roomId, targetPhone, "admin");
      return NextResponse.json({ ok: true, participants: next });
    }

    if (action === "demote") {
      if (isOwnerTarget) return NextResponse.json({ error: "Нельзя понизить создателя комнаты" }, { status: 403 });
      const next = await setRoomParticipantRole(roomId, targetPhone, "member");
      return NextResponse.json({ ok: true, participants: next });
    }

    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (err) {
    return jsonAuthError(err);
  }
}
