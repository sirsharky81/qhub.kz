import { withCors } from "@/lib/api/cors";
import { assertSplitOwner, jsonSplitError } from "@/lib/split/guard";
import { setRoomRates } from "@/lib/split/store";
import type { Money } from "@/lib/split/types";

export async function PUT(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const owner = await assertSplitOwner(request, roomId);
    const body = (await request.json()) as { rates?: Array<{ currency: string; rate: Money }> };
    const room = await setRoomRates(roomId, owner.memberId, body.rates ?? []);
    return withCors(Response.json({ room }), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
