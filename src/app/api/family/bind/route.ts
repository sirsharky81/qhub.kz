import { checkFamilyRateLimit, getClientIp } from "@/lib/rate-limit";
import { jsonFamilyAuthError } from "@/lib/family/guard";
import { consumeBindToken } from "@/lib/family/store";
import { getWhitelistedMessengerPhoneFromRequest } from "@/lib/family/messenger-contact";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`bind:${ip}`);
    if (!allowed) {
      return Response.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    let body: { token?: string; name?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Неверный формат" }, { status: 400 });
    }

    const token = body.token?.trim();
    if (!token) {
      return Response.json({ error: "Укажите токен" }, { status: 400 });
    }

    const messengerPhone = await getWhitelistedMessengerPhoneFromRequest();
    const { member, accessToken, room } = await consumeBindToken(token, body.name, messengerPhone);

    return Response.json({
      roomId: room.roomId,
      roomName: room.name,
      memberId: member.memberId,
      accessToken,
      role: member.role,
      memberName: member.name,
    });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
