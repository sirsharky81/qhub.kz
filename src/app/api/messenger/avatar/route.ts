import { NextResponse } from "next/server";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { parseAvatarUploadBody, avatarBlobToResponse } from "@/lib/messenger/avatar-upload";
import { normalizeKzPhone } from "@/lib/messenger/phone";
import {
  deleteRoomAvatar,
  deleteUserAvatar,
  getRoomAvatarBlob,
  getRoomMeta,
  getRoomParticipants,
  getUserAvatarBlob,
  setRoomAvatarBlob,
  setUserAvatarBlob,
} from "@/lib/messenger/store";

function canManageRoom(
  phone: string,
  meta: { createdBy: string },
  participants: { phone: string; role?: string }[],
): boolean {
  if (phone === meta.createdBy) return true;
  const me = participants.find((p) => p.phone === phone);
  return me?.role === "owner" || me?.role === "admin";
}

export async function GET(request: Request) {
  try {
    await assertMessengerSession();
    const url = new URL(request.url);
    const phone = normalizeKzPhone(url.searchParams.get("phone") ?? "");
    const roomId = (url.searchParams.get("roomId") ?? "").toUpperCase();

    if (phone) {
      const blob = await getUserAvatarBlob(phone);
      if (!blob) return new NextResponse(null, { status: 404 });
      return avatarBlobToResponse(blob);
    }

    if (roomId) {
      const blob = await getRoomAvatarBlob(roomId);
      if (!blob) return new NextResponse(null, { status: 404 });
      return avatarBlobToResponse(blob);
    }

    return NextResponse.json({ error: "Укажите phone или roomId" }, { status: 400 });
  } catch (err) {
    return jsonAuthError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }
    const parsed = parseAvatarUploadBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const result = await setUserAvatarBlob(phone, parsed.mime, parsed.data);
    return NextResponse.json({ ok: true, avatarUrl: result.avatarUrl });
  } catch (err) {
    return jsonAuthError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const url = new URL(request.url);
    const roomId = (url.searchParams.get("roomId") ?? "").toUpperCase();

    if (roomId) {
      const meta = await getRoomMeta(roomId);
      if (!meta) return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
      const participants = await getRoomParticipants(roomId);
      if (!canManageRoom(phone, meta, participants)) {
        return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      }
      await deleteRoomAvatar(roomId);
      return NextResponse.json({ ok: true, avatarUrl: null });
    }

    await deleteUserAvatar(phone);
    return NextResponse.json({ ok: true, avatarUrl: null });
  } catch (err) {
    return jsonAuthError(err);
  }
}

/** Room avatar upload via ?roomId= */
export async function POST(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const url = new URL(request.url);
    const roomId = (url.searchParams.get("roomId") ?? "").toUpperCase();
    if (!roomId) {
      return NextResponse.json({ error: "Укажите roomId" }, { status: 400 });
    }

    const meta = await getRoomMeta(roomId);
    if (!meta) return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
    const participants = await getRoomParticipants(roomId);
    if (!canManageRoom(phone, meta, participants)) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
    }

    const parsed = parseAvatarUploadBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const result = await setRoomAvatarBlob(roomId, parsed.mime, parsed.data);
    return NextResponse.json({ ok: true, avatarUrl: result.avatarUrl });
  } catch (err) {
    return jsonAuthError(err);
  }
}
