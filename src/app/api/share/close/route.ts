import { withCors } from "@/lib/api/cors";
import { assertShareParticipant, jsonShareAuthError } from "@/lib/share/guard";
import { closeShareRoom } from "@/lib/share/store";

export async function POST(request: Request) {
  try {
    const { participantId } = await assertShareParticipant(request);
    await closeShareRoom(participantId);
    return withCors(Response.json({ ok: true }), request);
  } catch (err) {
    return withCors(jsonShareAuthError(err), request);
  }
}
