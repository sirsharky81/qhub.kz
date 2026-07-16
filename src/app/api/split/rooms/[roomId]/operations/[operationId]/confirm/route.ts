import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { confirmWithdrawal } from "@/lib/split/ledger-store";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ roomId: string; operationId: string }> },
) {
  try {
    const { roomId, operationId } = await ctx.params;
    const member = await assertSplitRoomMember(request, roomId);
    const operation = await confirmWithdrawal(roomId, operationId, member.memberId);
    return withCors(Response.json(operation), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
