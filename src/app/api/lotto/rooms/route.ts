import { checkLottoRateLimit, getClientIp } from "@/lib/rate-limit";
import { createLottoRoom, stripJoinTokens } from "@/lib/lotto-rooms/room-service";
import type { LottoSettings, LottoWinRules } from "@/lib/random-picker/lotto";

interface CreateBody {
  hostName?: string;
  settings?: LottoSettings;
  winRules?: LottoWinRules;
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = await checkLottoRateLimit(ip);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов. Попробуйте позже." },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: CreateBody;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Неверный формат запроса" }, { status: 400 });
    }

    const room = await createLottoRoom({
      hostName: body.hostName?.trim() || "Игрок 1",
      settings: body.settings,
      winRules: body.winRules,
    });
    const host = room.players[0];
    if (!host) {
      return Response.json({ error: "Не удалось создать ведущего комнаты" }, { status: 500 });
    }
    const publicRoom = stripJoinTokens(room);

    return Response.json({
      roomCode: room.roomCode,
      hostSecret: room.hostSecret,
      playerId: host.id,
      joinToken: host.joinToken,
      playerName: host.name,
      room: publicRoom,
    });
  } catch (err) {
    console.error("[lotto/rooms] create failed:", err);
    return Response.json({ error: "Не удалось создать комнату" }, { status: 500 });
  }
}
