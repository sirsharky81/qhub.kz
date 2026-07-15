import { withCors } from "@/lib/api/cors";
import { assertSplitRoomMember, jsonSplitError } from "@/lib/split/guard";
import { addDeviceToWhitelist, toPublicMember } from "@/lib/split/store";

export async function POST(request: Request, ctx: { params: Promise<{ roomId: string; memberId: string }> }) {
  try {
    const { roomId, memberId } = await ctx.params;
    const actor = await assertSplitRoomMember(request, roomId);
    // Self or owner/caretaker (assertSplitOwner not required — any connected may help add device for room mates;
    // restrict to self or same-room connected for MVP safety: self OR any room member).
    void actor;
    const body = (await request.json()) as { deviceKey?: string };
    if (!body.deviceKey?.trim()) {
      return withCors(Response.json({ error: "Нужен deviceKey" }, { status: 400 }), request);
    }
    const member = await addDeviceToWhitelist({ roomId, memberId, deviceKey: body.deviceKey });
    return withCors(Response.json(toPublicMember(member)), request);
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
