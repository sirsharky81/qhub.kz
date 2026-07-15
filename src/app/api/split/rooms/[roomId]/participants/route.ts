import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { addLocalParticipant, listMembers, toPublicMember } from "@/lib/split/store";

export async function GET(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const members = (await listMembers(roomId)).map(toPublicMember);
    return withCors(Response.json({ members }), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const body = (await request.json()) as { displayName?: string; avatarUrl?: string | null };
    if (!body.displayName?.trim()) {
      return withCors(Response.json({ error: "Укажите имя участника" }, { status: 400 }), request);
    }
    const member = await addLocalParticipant({
      roomId,
      displayName: body.displayName,
      avatarUrl: body.avatarUrl,
    });
    return withCors(Response.json(toPublicMember(member)), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
