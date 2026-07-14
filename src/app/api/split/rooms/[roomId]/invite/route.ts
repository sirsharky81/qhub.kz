import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { createInvitation } from "@/lib/split/store";

export async function POST(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const member = await assertSplitRoomMember(request, roomId);
    let body: { channel?: "link" | "qr" | "messenger" } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const invitation = await createInvitation({
      roomId,
      createdBy: member.memberId,
      channel: body.channel ?? "link",
    });
    return withCors(
      Response.json({
        token: invitation.token,
        expiresAt: invitation.expiresAt,
        joinPath: `/tools/split/join?token=${encodeURIComponent(invitation.token)}`,
      }),
      request,
    );
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
