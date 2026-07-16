import { withCors } from "@/lib/api/cors";
import { createFamily, listFamilies } from "@/lib/split/family-store";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { bumpSplitRoomVersion, getRoom } from "@/lib/split/store";

export async function GET(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const families = await listFamilies(roomId);
    return withCors(Response.json({ families }), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const member = await assertSplitRoomMember(request, roomId);
    const room = await getRoom(roomId);
    if (!room) return withCors(Response.json({ error: "Комната не найдена" }, { status: 404 }), request);

    const body = (await request.json()) as {
      name?: string;
      memberIds?: string[];
      childrenCount?: number;
    };
    if (!body.name?.trim() || !body.memberIds?.length) {
      return withCors(Response.json({ error: "Укажите название и участников семьи" }, { status: 400 }), request);
    }

    const family = await createFamily({
      room,
      actorMemberId: member.memberId,
      name: body.name,
      memberIds: body.memberIds,
      childrenCount: body.childrenCount,
    });
    await bumpSplitRoomVersion(room.roomId);
    return withCors(Response.json(family), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
