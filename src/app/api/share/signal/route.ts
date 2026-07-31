import { withCors } from "@/lib/api/cors";
import { checkShareSignalRateLimit } from "@/lib/rate-limit";
import { assertShareParticipant, jsonShareAuthError } from "@/lib/share/guard";
import { appendShareSignal, getParticipant, getRoom } from "@/lib/share/store";
import type { ShareSignalType } from "@/lib/share/types";

const ALLOWED: ShareSignalType[] = ["offer", "answer", "ice"];

export async function POST(request: Request) {
  try {
    const { participantId } = await assertShareParticipant(request);
    const { allowed, retryAfterSec } = await checkShareSignalRateLimit(`signal:${participantId}`);
    if (!allowed) {
      return withCors(
        Response.json(
          { error: "Слишком много запросов" },
          { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
        ),
        request,
      );
    }

    let body: { type?: ShareSignalType; payload?: string };
    try {
      body = await request.json();
    } catch {
      return withCors(Response.json({ error: "Неверный формат" }, { status: 400 }), request);
    }

    const type = body.type;
    if (!type || !ALLOWED.includes(type)) {
      return withCors(Response.json({ error: "Неполные данные сигнала" }, { status: 400 }), request);
    }

    const participant = await getParticipant(participantId);
    if (!participant) {
      return withCors(Response.json({ error: "Сессия истекла" }, { status: 401 }), request);
    }

    const room = await getRoom(participant.roomId);
    if (!room || room.closed) {
      return withCors(Response.json({ error: "Комната не найдена" }, { status: 404 }), request);
    }

    const payload =
      typeof body.payload === "string" && body.payload.length > 0
        ? body.payload.slice(0, 32_000)
        : undefined;

    if ((type === "offer" || type === "answer" || type === "ice") && !payload) {
      return withCors(Response.json({ error: "Требуется payload" }, { status: 400 }), request);
    }

    const signal = await appendShareSignal({
      roomId: room.roomId,
      fromParticipantId: participantId,
      type,
      payload,
    });

    if (!signal) {
      return withCors(Response.json({ error: "Комната не найдена" }, { status: 404 }), request);
    }

    return withCors(Response.json({ ok: true, signal }), request);
  } catch (err) {
    return withCors(jsonShareAuthError(err), request);
  }
}
