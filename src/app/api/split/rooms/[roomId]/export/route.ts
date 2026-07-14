import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { exportSnapshotCsv } from "@/lib/split/export/csv";
import { getRoomSnapshot } from "@/lib/split/store";

export async function GET(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const snapshot = await getRoomSnapshot(roomId);
    const csv = exportSnapshotCsv(snapshot);
    return withCors(
      new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="split-${roomId}.csv"`,
        },
      }),
      request,
    );
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
