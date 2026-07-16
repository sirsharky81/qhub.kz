import { withCors } from "@/lib/api/cors";
import { deleteFamily, updateFamily } from "@/lib/split/family-store";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { bumpSplitRoomVersion, getRoom } from "@/lib/split/store";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ roomId: string; familyId: string }> },
) {
  try {
    const { roomId, familyId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const room = await getRoom(roomId);
    if (!room) return withCors(Response.json({ error: "Комната не найдена" }, { status: 404 }), request);

    const body = (await request.json()) as {
      name?: string;
      memberIds?: string[];
      childrenCount?: number;
    };
    const family = await updateFamily({
      room,
      familyId,
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

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ roomId: string; familyId: string }> },
) {
  try {
    const { roomId, familyId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const room = await getRoom(roomId);
    if (!room) return withCors(Response.json({ error: "Комната не найдена" }, { status: 404 }), request);

    await deleteFamily(room, familyId);
    await bumpSplitRoomVersion(room.roomId);
    return withCors(Response.json({ ok: true }), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
