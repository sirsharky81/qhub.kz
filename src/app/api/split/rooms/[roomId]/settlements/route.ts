import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { createSettlement, listSettlements } from "@/lib/split/store";
import type { Money } from "@/lib/split/types";

export async function GET(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const settlements = await listSettlements(roomId);
    return withCors(Response.json({ settlements }), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const member = await assertSplitRoomMember(request, roomId);
    const body = (await request.json()) as {
      fromMemberId?: string;
      toMemberId?: string;
      amountBase?: Money;
      comment?: string;
      clientMutationId?: string;
    };
    if (!body.fromMemberId || !body.toMemberId || !body.amountBase) {
      return withCors(Response.json({ error: "Неполные данные погашения" }, { status: 400 }), request);
    }
    const settlement = await createSettlement({
      roomId,
      actorMemberId: member.memberId,
      fromMemberId: body.fromMemberId,
      toMemberId: body.toMemberId,
      amountBase: body.amountBase,
      comment: body.comment,
      clientMutationId: body.clientMutationId,
    });
    return withCors(Response.json(settlement), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
