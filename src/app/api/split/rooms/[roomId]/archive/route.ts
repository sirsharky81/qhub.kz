import { withCors } from "@/lib/api/cors";
import { assertSplitOwner, jsonSplitError } from "@/lib/split/guard";
import { archiveRoom } from "@/lib/split/store";

export async function POST(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const owner = await assertSplitOwner(request, roomId);
    const room = await archiveRoom(roomId, owner.memberId);
    return withCors(Response.json({ room }), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
