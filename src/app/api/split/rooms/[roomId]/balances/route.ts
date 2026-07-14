import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { computeBalances, suggestSettlements } from "@/lib/split/engine";
import { getRoom, listExpenses, listSettlements } from "@/lib/split/store";

export async function GET(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const room = await getRoom(roomId);
    if (!room) throw new Error("room_not_found");
    const expenses = await listExpenses(roomId);
    const settlements = await listSettlements(roomId);
    const balances = computeBalances(room.memberIds, expenses, settlements);
    return withCors(
      Response.json({ balances, suggestions: suggestSettlements(balances) }),
      request,
    );
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
