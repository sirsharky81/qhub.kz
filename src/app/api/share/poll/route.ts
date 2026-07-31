import { withCors } from "@/lib/api/cors";
import { checkSharePollRateLimit } from "@/lib/rate-limit";
import { assertShareParticipant, jsonShareAuthError } from "@/lib/share/guard";
import { buildPollSnapshot } from "@/lib/share/store";

export async function GET(request: Request) {
  try {
    const { participantId } = await assertShareParticipant(request);
    const { allowed, retryAfterSec } = await checkSharePollRateLimit(`poll:${participantId}`);
    if (!allowed) {
      return withCors(
        Response.json(
          { error: "Слишком много запросов" },
          { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
        ),
        request,
      );
    }

    const url = new URL(request.url);
    const afterSeq = Number(url.searchParams.get("afterSeq") ?? "0");

    const snapshot = await buildPollSnapshot(participantId, Number.isFinite(afterSeq) ? afterSeq : 0);
    if (!snapshot) {
      return withCors(Response.json({ error: "Комната не найдена" }, { status: 404 }), request);
    }

    return withCors(Response.json(snapshot), request);
  } catch (err) {
    return withCors(jsonShareAuthError(err), request);
  }
}
