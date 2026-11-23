import { withCors } from "@/lib/api/cors";
import { assertAssistMember, jsonAssistError } from "@/lib/subaru-assist/guard";
import { assistSignalsSince, getAssistState } from "@/lib/subaru-assist/store";

export async function GET(request: Request) {
  try {
    const { engine, member } = await assertAssistMember(request);
    const snapshot = await engine.buildSnapshot(member.memberId);
    if (!snapshot) {
      return withCors(Response.json({ error: "Комната закрыта" }, { status: 404 }), request);
    }
    const url = new URL(request.url);
    const since = Number(url.searchParams.get("since") ?? "0");
    const state = await getAssistState(member.roomId);
    const signals = assistSignalsSince(state, Number.isFinite(since) ? since : 0);
    return withCors(
      Response.json({
        roomCode: snapshot.room.roomCode,
        closed: snapshot.room.closed,
        expiresAt: snapshot.room.expiresAt,
        members: snapshot.members,
        state,
        signals,
        latestSeq: state.signalSeq,
      }),
      request,
    );
  } catch (err) {
    return withCors(jsonAssistError(err), request);
  }
}
