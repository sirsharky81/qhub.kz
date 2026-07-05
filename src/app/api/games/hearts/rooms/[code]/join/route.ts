import { NextResponse } from "next/server";
import { joinRoomByCode } from "@/lib/games/hearts/rooms/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const body = (await request.json()) as { playerName?: string };
    const playerName = body.playerName?.trim() || "Игрок";
    const result = await joinRoomByCode(code, playerName);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to join room";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
