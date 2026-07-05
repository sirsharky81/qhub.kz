import { NextResponse } from "next/server";
import { dispatchAction } from "@/lib/games/hearts/rooms/service";
import type { HeartsAction } from "@/lib/games/hearts/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const body = (await request.json()) as {
      playerId: string;
      joinToken: string;
      action: HeartsAction;
    };
    const room = await dispatchAction(code, body);
    return NextResponse.json(room);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action rejected";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
