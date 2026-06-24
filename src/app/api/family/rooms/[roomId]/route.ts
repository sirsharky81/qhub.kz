import { checkFamilyRateLimit } from "@/lib/rate-limit";
import { assertOwner, jsonFamilyAuthError } from "@/lib/family/guard";
import { deleteFamilyRoom, getRoom, updateRoomMessengerLink, updateRoomSosPhone } from "@/lib/family/store";
import { isValidSosPhone, normalizeSosPhone } from "@/lib/family/phone";

interface RouteContext {
  params: Promise<{ roomId: string }>;
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { roomId } = await context.params;
    const member = await assertOwner(request, roomId);
    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`delete:${member.memberId}`);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    await deleteFamilyRoom(roomId, member.memberId);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { roomId } = await context.params;
    const member = await assertOwner(request, roomId);

    let body: { messengerRoomId?: string | null; sosPhone?: string | null };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Неверный формат" }, { status: 400 });
    }

    let room = await getRoom(roomId);
    if (!room) {
      return Response.json({ error: "Комната не найдена" }, { status: 404 });
    }

    if (body.messengerRoomId !== undefined) {
      const messengerRoomId =
        body.messengerRoomId === null || body.messengerRoomId === ""
          ? null
          : body.messengerRoomId;
      room = await updateRoomMessengerLink(roomId, messengerRoomId);
    }

    if (body.sosPhone !== undefined) {
      if (body.sosPhone === null || body.sosPhone === "") {
        room = await updateRoomSosPhone(roomId, null);
      } else {
        const normalized = normalizeSosPhone(body.sosPhone);
        if (!isValidSosPhone(normalized)) {
          return Response.json({ error: "Некорректный номер телефона" }, { status: 400 });
        }
        room = await updateRoomSosPhone(roomId, normalized);
      }
    }

    if (!room) {
      return Response.json({ error: "Комната не найдена" }, { status: 404 });
    }

    return Response.json({
      ok: true,
      messengerRoomId: room.messengerRoomId,
      sosPhone: room.sosPhone ?? null,
      version: room.version,
    });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { roomId } = await context.params;
    const room = await getRoom(roomId);
    if (!room) {
      return Response.json({ error: "Комната не найдена" }, { status: 404 });
    }
    return Response.json({
      roomId: room.roomId,
      name: room.name,
      messengerRoomId: room.messengerRoomId,
      sosPhone: room.sosPhone ?? null,
      version: room.version,
    });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
