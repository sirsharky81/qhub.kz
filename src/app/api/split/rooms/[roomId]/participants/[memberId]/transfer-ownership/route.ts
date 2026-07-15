import { withCors } from "@/lib/api/cors";
import { assertSplitOwner, jsonSplitError } from "@/lib/split/guard";
import { transferOwnership } from "@/lib/split/store";

export async function POST(request: Request, ctx: { params: Promise<{ roomId: string; memberId: string }> }) {
  try {
    const { roomId, memberId } = await ctx.params;
    await assertSplitOwner(request, roomId);
    const room = await transferOwnership({ roomId, toMemberId: memberId });
    return withCors(Response.json({ room }), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
