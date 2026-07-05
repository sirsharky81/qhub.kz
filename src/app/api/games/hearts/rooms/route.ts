import { NextResponse } from "next/server";
import { createRoom, getRoomPublic, quickMatch } from "@/lib/games/hearts/rooms/service";

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
      mode?: "quick" | "create";
      playerName?: string;
    };
    const playerName = body.playerName?.trim() || "Игрок";
    if (body.mode === "create") {
      const result = await createRoom(playerName);
      return NextResponse.json(result);
    }
    const result = await quickMatch(playerName);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create room";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
