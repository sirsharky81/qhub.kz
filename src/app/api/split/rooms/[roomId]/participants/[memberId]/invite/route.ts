import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { createInvitation } from "@/lib/split/store";

export async function POST(request: Request, ctx: { params: Promise<{ roomId: string; memberId: string }> }) {
  try {
    const { roomId, memberId } = await ctx.params;
    const actor = await assertSplitRoomMember(request, roomId);
    let body: { channel?: "link" | "qr" | "messenger" } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const invitation = await createInvitation({
      roomId,
      createdBy: actor.memberId,
      channel: body.channel ?? "link",
      seatMemberId: memberId,
    });
    return withCors(
      Response.json({
        token: invitation.token,
        expiresAt: invitation.expiresAt,
        seatMemberId: invitation.seatMemberId,
        joinPath: `/tools/split/join?token=${encodeURIComponent(invitation.token)}`,
      }),
      request,
    );
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
