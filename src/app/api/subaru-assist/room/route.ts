import { withCors } from "@/lib/api/cors";
import { MessengerAuthError, assertMessengerSession } from "@/lib/messenger/guard";
import { isSubaruCodingPhoneAllowed } from "@/lib/subaru-coding/access";
import { assertAssistMember, jsonAssistError } from "@/lib/subaru-assist/guard";
import { clearAssistState } from "@/lib/subaru-assist/store";
import { checkSubaruAssistRateLimit, getClientIp } from "@/lib/rate-limit";
import { createSubaruAssistRoomEngine } from "@/lib/room-core/engine";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = await checkSubaruAssistRateLimit(`create:${ip}`);
    if (!allowed) {
      return withCors(
        Response.json({ error: "Слишком много запросов" }, { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined }),
        request,
      );
    }
    const { phone } = await assertMessengerSession();
    if (!(await isSubaruCodingPhoneAllowed(phone))) {
      return withCors(
        Response.json(
          { error: "Этот номер не допущен к Subaru Coding" },
          { status: 403 },
        ),
        request,
      );
    }
    const engine = createSubaruAssistRoomEngine();
    const created = await engine.createRoom(`Мастер ${phone.slice(-4)}`);
    return withCors(
      Response.json({
        roomId: created.room.roomId,
        memberId: created.member.memberId,
        accessToken: created.accessToken,
        role: "master",
        roomCode: created.room.roomCode,
      }),
      request,
    );
  } catch (err) {
    if (err instanceof MessengerAuthError) {
      return withCors(Response.json({ error: err.message }, { status: err.status }), request);
    }
    console.error("[subaru-assist/room]", err);
    return withCors(Response.json({ error: "Не удалось создать комнату" }, { status: 500 }), request);
  }
}

export async function DELETE(request: Request) {
  try {
    const { engine, member } = await assertAssistMember(request);
    if (member.role === "master") {
      const closed = await engine.closeRoom(member.memberId);
      if (!closed) {
        return withCors(Response.json({ error: "Комнату может удалить только мастер" }, { status: 403 }), request);
      }
      await clearAssistState(member.roomId);
      return withCors(Response.json({ ok: true, closed: true }), request);
    }
    await engine.leaveRoom(member.memberId);
    return withCors(Response.json({ ok: true, left: true }), request);
  } catch (err) {
    return withCors(jsonAssistError(err), request);
  }
}
