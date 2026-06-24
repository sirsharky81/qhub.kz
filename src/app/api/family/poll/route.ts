import { NextResponse } from "next/server";
import { checkFamilyRateLimit } from "@/lib/rate-limit";
import { assertRoomMember, jsonFamilyAuthError } from "@/lib/family/guard";
import { buildPollSnapshot, getRoom, refreshMemberHeartbeat } from "@/lib/family/store";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId") ?? "";
    const sinceVersion = Number(url.searchParams.get("since") ?? "0");
    const heartbeat = url.searchParams.get("heartbeat") === "1";

    if (!roomId) {
      return NextResponse.json({ error: "Укажите roomId" }, { status: 400 });
    }

    const member = await assertRoomMember(request, roomId);
    const { allowed, retryAfterSec } = await checkFamilyRateLimit(`poll:${member.memberId}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    if (!(await getRoom(roomId))) {
      return NextResponse.json({ error: "room_gone" }, { status: 410 });
    }

    if (heartbeat) {
      await refreshMemberHeartbeat(member.memberId);
    }

    const snapshot = await buildPollSnapshot(roomId, member.memberId);
    if (!snapshot) {
      return NextResponse.json({ error: "room_gone" }, { status: 410 });
    }

    if (sinceVersion >= snapshot.version && !heartbeat) {
      return new NextResponse(null, { status: 304 });
    }

    if (sinceVersion >= snapshot.version) {
      return NextResponse.json({ snapshot, version: snapshot.version });
    }

    return NextResponse.json({ snapshot, version: snapshot.version });
  } catch (err) {
    return jsonFamilyAuthError(err);
  }
}
