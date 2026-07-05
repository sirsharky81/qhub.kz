import { NextResponse } from "next/server";
import { startRoom } from "@/lib/games/hearts/rooms/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const body = (await request.json()) as {
      playerId: string;
      joinToken: string;
    };
    const room = await startRoom(code, body.playerId, body.joinToken);
    return NextResponse.json(room);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start room";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
