import { withCors } from "@/lib/api/cors";
import { checkShareRateLimit, getClientIp } from "@/lib/rate-limit";
import { createShareRoom } from "@/lib/share/store";
import { buildShareInviteUrl } from "@/lib/share/urls";
import { getPublicOrigin } from "@/lib/public-origin";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed, retryAfterSec } = await checkShareRateLimit(`create:${ip}`);
    if (!allowed) {
      return withCors(
        Response.json(
          { error: "Слишком много запросов" },
          { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
        ),
        request,
      );
    }

    let body: { deviceName?: string; pin?: string };
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const { room, participant, accessToken, inviteToken } = await createShareRoom(
      body.deviceName ?? "Устройство",
      body.pin,
    );
    const origin = getPublicOrigin(request);

    return withCors(
      Response.json({
        roomId: room.roomId,
        participantId: participant.participantId,
        accessToken,
        role: participant.role,
        deviceName: participant.deviceName,
        roomCode: room.roomCode,
        inviteToken,
        inviteUrl: buildShareInviteUrl(inviteToken, origin),
        expiresAt: room.expiresAt,
        hasPin: Boolean(room.pinHash),
      }),
      request,
    );
  } catch (err) {
    console.error("[share/create]", err);
    return withCors(Response.json({ error: "Не удалось создать комнату" }, { status: 500 }), request);
  }
}
