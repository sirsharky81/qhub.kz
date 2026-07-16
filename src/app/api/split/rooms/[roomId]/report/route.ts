import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { getSplitReport } from "@/lib/split/ledger-store";

export async function GET(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const report = await getSplitReport(roomId);
    return withCors(Response.json(report), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
