import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { confirmSettlement } from "@/lib/split/store";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ roomId: string; settlementId: string }> },
) {
  try {
    const { roomId, settlementId } = await ctx.params;
    const member = await assertSplitRoomMember(request, roomId);
    const settlement = await confirmSettlement(roomId, settlementId, member.memberId);
    return withCors(Response.json(settlement), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
