import { withCors } from "@/lib/api/cors";
import { checkSubaruAssistRateLimit, getClientIp } from "@/lib/rate-limit";
import { createSubaruAssistRoomEngine } from "@/lib/room-core/engine";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = await checkSubaruAssistRateLimit(`join:${ip}`);
    if (!allowed) {
      return withCors(
        Response.json({ error: "Слишком много запросов" }, { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined }),
        request,
      );
    }
    let body: { roomCode?: string };
    try {
      body = await request.json();
    } catch {
      return withCors(Response.json({ error: "Неверный формат" }, { status: 400 }), request);
    }
    const roomCode = body.roomCode?.trim() ?? "";
    if (roomCode.length < 4) {
      return withCors(Response.json({ error: "Введите код комнаты" }, { status: 400 }), request);
    }
    const engine = createSubaruAssistRoomEngine();
    try {
      const joined = await engine.joinRoom(roomCode, "Клиент");
      return withCors(
        Response.json({
          roomId: joined.room.roomId,
          memberId: joined.member.memberId,
          accessToken: joined.accessToken,
          role: "client",
          roomCode: joined.room.roomCode,
        }),
        request,
      );
    } catch (err) {
      const code = err instanceof Error ? err.message : "join_failed";
      const status = code === "room_full" ? 409 : code === "room_not_found" || code === "room_expired" ? 404 : 410;
      const error =
        code === "room_full"
          ? "В комнате уже есть клиент"
          : code === "room_expired"
            ? "Код комнаты истёк"
            : "Комната не найдена";
      return withCors(Response.json({ error }, { status }), request);
    }
  } catch (err) {
    console.error("[subaru-assist/join]", err);
    return withCors(Response.json({ error: "Не удалось войти в комнату" }, { status: 500 }), request);
  }
}
