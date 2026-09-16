import { NextResponse } from "next/server";
import { joinRoomByCode } from "@/lib/games/chess/rooms/service";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const body = (await request.json()) as { playerName?: string };
    const result = await joinRoomByCode(code, body.playerName?.trim() || "Игрок");
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to join room";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
