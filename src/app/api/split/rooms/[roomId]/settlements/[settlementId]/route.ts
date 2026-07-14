import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { deleteSettlement } from "@/lib/split/store";

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ roomId: string; settlementId: string }> },
) {
  try {
    const { roomId, settlementId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    await deleteSettlement(roomId, settlementId);
    return withCors(Response.json({ ok: true }), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
