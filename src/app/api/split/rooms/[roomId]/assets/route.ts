import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { createAsset, listAssets } from "@/lib/split/ledger-store";
import type { RoomAssetKind } from "@/lib/split/ledger";

export async function GET(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    await assertSplitRoomMember(request, roomId);
    const assets = await listAssets(roomId);
    return withCors(Response.json({ assets }), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const member = await assertSplitRoomMember(request, roomId);
    const body = (await request.json()) as {
      name?: string;
      kind?: RoomAssetKind;
      currency?: string;
      custodianMemberId?: string;
    };
    if (!body.currency) {
      return withCors(Response.json({ error: "Укажите валюту актива" }, { status: 400 }), request);
    }
    const asset = await createAsset({
      roomId,
      actorMemberId: member.memberId,
      name: body.name || "Касса",
      kind: body.kind,
      currency: body.currency,
      custodianMemberId: body.custodianMemberId || member.memberId,
    });
    return withCors(Response.json(asset), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
