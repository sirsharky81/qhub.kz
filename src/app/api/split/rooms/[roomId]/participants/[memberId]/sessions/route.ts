import { withCors } from "@/lib/api/cors";
import { jsonSplitError } from "@/lib/split/guard";
import { createWhitelistedSession } from "@/lib/split/store";

/** Open an extra session for a connected seat — deviceKey must be whitelisted. No prior auth. */
export async function POST(request: Request, ctx: { params: Promise<{ roomId: string; memberId: string }> }) {
  try {
    const { roomId, memberId } = await ctx.params;
    const body = (await request.json()) as { deviceKey?: string };
    if (!body.deviceKey?.trim()) {
      return withCors(Response.json({ error: "Нужен deviceKey" }, { status: 400 }), request);
    }
    const { member, accessToken } = await createWhitelistedSession({
      roomId,
      memberId,
      deviceKey: body.deviceKey,
    });
    return withCors(
      Response.json({
        roomId: member.roomId,
        memberId: member.memberId,
        accessToken,
        role: member.role,
        displayName: member.displayName,
      }),
      request,
    );
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
