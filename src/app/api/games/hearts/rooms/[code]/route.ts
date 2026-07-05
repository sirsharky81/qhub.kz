import { NextResponse } from "next/server";
import { closeRoom, getRoomPublic } from "@/lib/games/hearts/rooms/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const room = await getRoomPublic(code);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  return NextResponse.json(room);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const playerId = request.headers.get("x-player-id");
  const joinToken = request.headers.get("x-join-token");
  if (!playerId || !joinToken) {
    return NextResponse.json({ error: "Missing room owner credentials" }, { status: 400 });
  }
  const closed = await closeRoom(code, playerId, joinToken);
  if (!closed) {
    return NextResponse.json({ error: "Room not found or forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
