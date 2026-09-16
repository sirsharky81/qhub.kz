import { NextResponse } from "next/server";
import { createRoom, getRoomPublic } from "@/lib/games/chess/rooms/service";
import { getTimeControl, type ChessColorPref } from "@/lib/games/chess/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "code query param is required" }, { status: 400 });
  }
  const room = await getRoomPublic(code);
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  return NextResponse.json(room);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      playerName?: string;
      colorPref?: ChessColorPref;
      timeControlId?: string;
    };
    const colorPref =
      body.colorPref === "w" || body.colorPref === "b" || body.colorPref === "random" ? body.colorPref : "random";
    const result = await createRoom({
      playerName: body.playerName?.trim() || "Игрок",
      colorPref,
      timeControl: getTimeControl(body.timeControlId ?? "5+0"),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create room";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
