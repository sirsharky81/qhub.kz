import { withCors } from "@/lib/api/cors";
import { checkShareRateLimit, getClientIp } from "@/lib/rate-limit";
import { joinShareRoom } from "@/lib/share/store";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = await checkShareRateLimit(`join:${ip}`);
    if (!allowed) {
      return withCors(
        Response.json(
          { error: "Слишком много запросов" },
          { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
        ),
        request,
      );
    }

    let body: { joinInput?: string; deviceName?: string };
    try {
      body = await request.json();
    } catch {
      return withCors(Response.json({ error: "Неверный формат" }, { status: 400 }), request);
    }

    const joinInput = body.joinInput?.trim() ?? "";
    if (!joinInput) {
      return withCors(Response.json({ error: "Укажите код или ссылку" }, { status: 400 }), request);
    }

    try {
      const { room, participant, accessToken } = await joinShareRoom(joinInput, body.deviceName ?? "Устройство");
      return withCors(
        Response.json({
          roomId: room.roomId,
          participantId: participant.participantId,
          accessToken,
          role: participant.role,
          deviceName: participant.deviceName,
          roomCode: room.roomCode,
          expiresAt: room.expiresAt,
        }),
        request,
      );
    } catch (err) {
      const code = err instanceof Error ? err.message : "join_failed";
      const status = code === "room_full" ? 409 : code === "room_not_found" ? 404 : 410;
      return withCors(Response.json({ error: code }, { status }), request);
    }
  } catch (err) {
    console.error("[share/join]", err);
    return withCors(Response.json({ error: "Не удалось подключиться" }, { status: 500 }), request);
  }
}
