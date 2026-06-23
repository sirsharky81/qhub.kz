import { checkLottoRateLimit, getClientIp } from "@/lib/rate-limit";
import { createLottoRoom } from "@/lib/lotto-rooms/room-service";
import type { LottoPlayer } from "@/lib/random-picker/lotto-tickets";
import type { LottoSettings, LottoWinRules } from "@/lib/random-picker/lotto";

interface CreateBody {
  players?: LottoPlayer[];
  settings?: LottoSettings;
  winRules?: LottoWinRules;
  cardsGenerated?: boolean;
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

    const players = Array.isArray(body.players) ? body.players : [];
    if (players.length < 2) {
      return Response.json({ error: "Нужно минимум 2 участника" }, { status: 400 });
    }

    const room = await createLottoRoom({
      players,
      settings: body.settings,
      winRules: body.winRules,
      cardsGenerated: Boolean(body.cardsGenerated),
    });

    return Response.json({
      roomCode: room.roomCode,
      hostSecret: room.hostSecret,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        ticket: p.ticket,
        wins: p.wins,
        joinCode: p.joinCode,
        joinToken: p.joinToken,
      })),
    });
  } catch (err) {
    console.error("[lotto/rooms] create failed:", err);
    return Response.json({ error: "Не удалось создать комнату" }, { status: 500 });
  }
}
