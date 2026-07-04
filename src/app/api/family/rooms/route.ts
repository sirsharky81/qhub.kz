import { checkFamilyRateLimit, getClientIp } from "@/lib/rate-limit";
import { createFamilyRoom } from "@/lib/family/store";
import { withCors } from "@/lib/api/cors";
import { getWhitelistedMessengerPhoneFromRequest } from "@/lib/family/messenger-contact";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`create:${ip}`);
    if (!allowed) {
      return withCors(
        Response.json(
          { error: "Слишком много запросов" },
          { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
        ),
        request,
      );
    }

    let body: { name?: string; parentName?: string };
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const messengerPhone = await getWhitelistedMessengerPhoneFromRequest();
    const { room, ownerMemberId, accessToken } = await createFamilyRoom(
      body.name ?? "Семья",
      body.parentName ?? "Родитель",
      messengerPhone,
    );

    return withCors(
      Response.json({
        roomId: room.roomId,
        roomName: room.name,
        memberId: ownerMemberId,
        accessToken,
        role: "owner" as const,
        memberName: body.parentName?.trim() || "Родитель",
      }),
      request,
    );
  } catch (err) {
    console.error("[family/rooms] create failed:", err);
    return withCors(
      Response.json({ error: "Не удалось создать комнату" }, { status: 500 }),
      request,
    );
  }
}
