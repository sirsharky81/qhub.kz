import { NextResponse } from "next/server";
import { checkLottoRateLimit, getClientIp } from "@/lib/rate-limit";
import { getRoom, saveRoom } from "@/lib/lotto-rooms/store";
import {
  findPlayerByCredentials,
  stripJoinTokens,
  updateLottoRoom,
} from "@/lib/lotto-rooms/room-service";
import type { LottoRoomSnapshot } from "@/lib/lotto-rooms/types";

type RouteContext = { params: Promise<{ code: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { code } = await context.params;
  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkLottoRateLimit(`poll:${ip}`);
  if (!allowed) {
    return Response.json(
      { error: "Слишком много запросов" },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
    );
  }

  const room = await getRoom(code);
  if (!room) {
    return Response.json({ error: "Комната не найдена" }, { status: 404 });
  }

  const url = new URL(request.url);
  const playerId = url.searchParams.get("playerId");
  const joinToken = url.searchParams.get("joinToken");
  const sinceVersion = Number(url.searchParams.get("sinceVersion") ?? "0");

  if (!playerId || !joinToken) {
    return Response.json({ error: "Требуется авторизация участника" }, { status: 401 });
  }

  const player = findPlayerByCredentials(room, playerId, joinToken);
  if (!player) {
    return Response.json({ error: "Неверный код участника" }, { status: 403 });
  }

  if (sinceVersion >= room.version) {
    return new NextResponse(null, { status: 304 });
  }

  const publicRoom = stripJoinTokens(room);
  const publicPlayer = publicRoom.players.find((p) => p.id === playerId)!;

  return Response.json({
    room: publicRoom,
    player: publicPlayer,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { code } = await context.params;
  const hostSecret = request.headers.get("X-Lotto-Host-Secret");
  if (!hostSecret) {
    return Response.json({ error: "Нет доступа ведущего" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkLottoRateLimit(`host:${ip}`);
  if (!allowed) {
    return Response.json(
      { error: "Слишком много запросов" },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
    );
  }

  let body: Partial<LottoRoomSnapshot>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const updated = await updateLottoRoom(code, hostSecret, body);
  if (!updated) {
    return Response.json({ error: "Комната не найдена или нет доступа" }, { status: 403 });
  }

  return Response.json({
    ok: true,
    version: updated.version,
    players: updated.players.map((p) => ({
      id: p.id,
      joined: p.joined,
      left: p.left,
    })),
  });
}
