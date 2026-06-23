import { checkLottoRateLimit, getClientIp } from "@/lib/rate-limit";
import { getRoom, saveRoom } from "@/lib/lotto-rooms/store";
import { findPlayerByCredentials, findPlayerByJoinCode } from "@/lib/lotto-rooms/room-service";

type RouteContext = { params: Promise<{ code: string }> };

interface JoinBody {
  joinCode?: string;
  playerId?: string;
  joinToken?: string;
}

export async function POST(request: Request, context: RouteContext) {
  const { code } = await context.params;
  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkLottoRateLimit(`join:${ip}`);
  if (!allowed) {
    return Response.json(
      { error: "Слишком много попыток" },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
    );
  }

  let body: JoinBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const room = await getRoom(code);
  if (!room) {
    return Response.json({ error: "Комната не найдена" }, { status: 404 });
  }

  if (!room.cardsGenerated) {
    return Response.json({ error: "Ведущий ещё не сформировал карточки" }, { status: 409 });
  }

  let player =
    body.joinCode && body.joinCode.trim()
      ? findPlayerByJoinCode(room, body.joinCode.trim())
      : body.playerId && body.joinToken
        ? findPlayerByCredentials(room, body.playerId, body.joinToken)
        : undefined;

  if (!player) {
    return Response.json({ error: "Неверный код комнаты или участника" }, { status: 403 });
  }

  if (player.left) {
    return Response.json({ error: "Вы уже покинули эту игру" }, { status: 409 });
  }

  player.joined = true;
  player.left = false;
  room.players = room.players.map((p) => (p.id === player!.id ? player! : p));
  room.version += 1;
  room.updatedAt = Date.now();
  await saveRoom(room);

  return Response.json({
    roomCode: room.roomCode,
    playerId: player.id,
    joinToken: player.joinToken,
    playerName: player.name,
  });
}
