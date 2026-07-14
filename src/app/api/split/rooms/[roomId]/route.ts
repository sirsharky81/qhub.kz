import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { getRoomSnapshot } from "@/lib/split/store";

export async function GET(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const snapshot = await getRoomSnapshot(roomId);
    return withCors(Response.json(snapshot), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
