import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { renameParticipant, toPublicMember } from "@/lib/split/store";

export async function PATCH(request: Request, ctx: { params: Promise<{ roomId: string; memberId: string }> }) {
  try {
    const { roomId, memberId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const body = (await request.json()) as { displayName?: string; avatarUrl?: string | null };
    if (!body.displayName?.trim()) {
      return withCors(Response.json({ error: "Укажите имя участника" }, { status: 400 }), request);
    }
    const member = await renameParticipant({
      roomId,
      memberId,
      displayName: body.displayName,
      avatarUrl: body.avatarUrl,
    });
    return withCors(Response.json(toPublicMember(member)), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
