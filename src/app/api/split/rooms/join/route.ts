import { checkSplitRateLimit, getClientIp } from "@/lib/rate-limit";
import { withCors } from "@/lib/api/cors";
import { jsonSplitError } from "@/lib/split/guard";
import { joinRoom } from "@/lib/split/store";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = await checkSplitRateLimit(`join:${ip}`);
    if (!allowed) {
      return withCors(
        Response.json(
          { error: "Слишком много запросов" },
          { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
        ),
        request,
      );
    }

    const body = (await request.json()) as {
      token?: string;
      displayName?: string;
      deviceKey?: string;
    };
    if (!body.token) {
      return withCors(Response.json({ error: "Нужен токен приглашения" }, { status: 400 }), request);
    }
    const { room, member, accessToken } = await joinRoom({
      token: body.token,
      displayName: body.displayName || "Участник",
      deviceKey: body.deviceKey ?? null,
    });
    return withCors(
      Response.json({
        roomId: room.roomId,
        memberId: member.memberId,
        accessToken,
        role: member.role,
        displayName: member.displayName,
        status: member.status,
      }),
      request,
    );
  } catch (err) {
    return withCors(jsonSplitError(err), request);
  }
}
