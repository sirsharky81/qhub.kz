import { withCors } from "@/lib/api/cors";
import { assertShareParticipant, jsonShareAuthError } from "@/lib/share/guard";
import { registerLanBeaconIndexed } from "@/lib/share/lan-beacon";
import { getClientIp } from "@/lib/rate-limit";
import { getRoom } from "@/lib/share/store";

export async function POST(request: Request) {
  try {
    const { participantId } = await assertShareParticipant(request);
    const participant = await import("@/lib/share/store").then((m) => m.getParticipant(participantId));
    if (!participant) {
      return withCors(Response.json({ error: "Сессия истекла" }, { status: 401 }), request);
    }
    const room = await getRoom(participant.roomId);
    if (!room) {
      return withCors(Response.json({ error: "Комната не найдена" }, { status: 404 }), request);
    }

    await registerLanBeaconIndexed({
      clientIp: getClientIp(request),
      roomId: room.roomId,
      roomCode: room.roomCode,
      deviceName: participant.deviceName,
    });

    return withCors(Response.json({ ok: true }), request);
  } catch (err) {
    return withCors(jsonShareAuthError(err), request);
  }
}
