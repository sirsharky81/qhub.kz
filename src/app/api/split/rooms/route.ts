import { checkSplitRateLimit, getClientIp } from "@/lib/rate-limit";
import { withCors } from "@/lib/api/cors";
import { createSplitRoom } from "@/lib/split/store";
import { jsonSplitError } from "@/lib/split/guard";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = await checkSplitRateLimit(`create:${ip}`);
    if (!allowed) {
      return withCors(
        Response.json(
          { error: "Слишком много запросов" },
          { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
        ),
        request,
      );
    }

    let body: {
      name?: string;
      ownerName?: string;
      baseCurrency?: string;
      roomType?: "individual" | "own_family" | "multi_family";
    } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const { room, owner, accessToken } = await createSplitRoom(body);
    return withCors(
      Response.json({
        roomId: room.roomId,
        roomName: room.name,
        memberId: owner.memberId,
        accessToken,
        role: owner.role,
        displayName: owner.displayName,
        baseCurrency: room.baseCurrency,
        roomType: room.roomType,
      }),
      request,
    );
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
