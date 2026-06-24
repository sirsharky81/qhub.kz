import { NextResponse } from "next/server";
import { checkMessengerRateLimit } from "@/lib/rate-limit";
import { HEARTBEAT_STALE_MS } from "@/lib/messenger/constants";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import {
  getDmMessagesSince,
  getRoomMessagesSince,
  getRoomMeta,
  pruneInactiveRoom,
  pruneStaleRoomParticipants,
  updateRoomHeartbeat,
} from "@/lib/messenger/store";

export async function GET(request: Request) {
  try {
    const { phone } = await assertMessengerSession();
    const { allowed, retryAfterSec } = await checkMessengerRateLimit(`poll:${phone}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    const url = new URL(request.url);
    const channel = url.searchParams.get("channel") ?? "";
    const sinceVersion = Number(url.searchParams.get("since") ?? "0");
    const heartbeat = url.searchParams.get("heartbeat") === "1";

    if (!channel) {
      return NextResponse.json({ error: "Укажите channel" }, { status: 400 });
    }

    if (channel.startsWith("dm:")) {
      const { meta, messages, envelopes } = await getDmMessagesSince(channel, sinceVersion);
      if (sinceVersion >= meta.version) {
        return new NextResponse(null, { status: 304 });
      }
      return NextResponse.json({ channel, meta, messages, envelopes });
    }

    if (channel.startsWith("room:")) {
      const roomId = channel.slice(5);
      await pruneInactiveRoom(roomId);
      await pruneStaleRoomParticipants(roomId, HEARTBEAT_STALE_MS);
      if (!(await getRoomMeta(roomId))) {
        return NextResponse.json({ error: "room_gone" }, { status: 410 });
      }
      if (heartbeat) {
        await updateRoomHeartbeat(roomId, phone);
      }
      const { meta, messages, envelopes, participants } = await getRoomMessagesSince(
        roomId,
        sinceVersion,
      );
      if (sinceVersion >= meta.version && !heartbeat) {
        return new NextResponse(null, { status: 304 });
      }
      if (sinceVersion >= meta.version) {
        return NextResponse.json({ channel, meta, messages: [], envelopes: [], participants });
      }
      return NextResponse.json({ channel, meta, messages, envelopes, participants });
    }

    return NextResponse.json({ error: "Неизвестный канал" }, { status: 400 });
  } catch (err) {
    return jsonAuthError(err);
  }
}
