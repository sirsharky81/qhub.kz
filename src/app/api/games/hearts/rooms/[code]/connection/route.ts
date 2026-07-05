import { NextResponse } from "next/server";
import { setConnectionState } from "@/lib/games/hearts/rooms/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const body = (await request.json()) as {
      playerId: string;
      joinToken: string;
      connected: boolean;
    };
    const room = await setConnectionState(code, body.playerId, body.joinToken, body.connected);
    if (!room) {
      return NextResponse.json({ closed: true });
    }
    return NextResponse.json(room);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update connection";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
