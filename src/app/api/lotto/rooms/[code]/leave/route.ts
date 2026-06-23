import { checkLottoRateLimit, getClientIp } from "@/lib/rate-limit";
import { getRoom, saveRoom } from "@/lib/lotto-rooms/store";
import { findPlayerByCredentials } from "@/lib/lotto-rooms/room-service";

type RouteContext = { params: Promise<{ code: string }> };

interface LeaveBody {
  playerId?: string;
  joinToken?: string;
}

export async function POST(request: Request, context: RouteContext) {
  const { code } = await context.params;
  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkLottoRateLimit(`leave:${ip}`);
  if (!allowed) {
    return Response.json(
      { error: "Слишком много запросов" },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
    );
  }

  let body: LeaveBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  if (!body.playerId || !body.joinToken) {
    return Response.json({ error: "Нет данных участника" }, { status: 400 });
  }

  const room = await getRoom(code);
  if (!room) {
    return Response.json({ error: "Комната не найдена" }, { status: 404 });
  }

  const player = findPlayerByCredentials(room, body.playerId, body.joinToken);
  if (!player) {
    return Response.json({ error: "Участник не найден" }, { status: 403 });
  }

  player.joined = false;
  player.left = true;
  room.players = room.players.map((p) => (p.id === player.id ? player : p));
  room.version += 1;
  room.updatedAt = Date.now();
  await saveRoom(room);

  return Response.json({ ok: true });
}
