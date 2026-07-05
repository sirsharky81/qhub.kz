import { NextResponse } from "next/server";
import { checkMessengerRateLimit } from "@/lib/rate-limit";
import { assertChannelParticipant, assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";
import { trackMessengerApiRequest } from "@/lib/messenger/metrics";
import {
  getDmMessagesSince,
  getRoomMessagesSince,
  getRoomMeta,
  pruneInactiveRoom,
  updateRoomHeartbeat,
} from "@/lib/messenger/store";
import {
  getMessengerPresence,
  isMessengerOnline,
  isMessengerTyping,
  setMessengerPresence,
} from "@/lib/messenger/push-store";
import { peerFromDmChannel } from "@/lib/messenger/phone";

const LONG_POLL_MAX_WAIT_MS = 7500;
const LONG_POLL_CHECK_INTERVAL_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: Request) {
  try {
    const track = (status: number) => void trackMessengerApiRequest("poll", status);
    const { phone } = await assertMessengerSession();
    const { allowed, retryAfterSec } = await checkMessengerRateLimit(`poll:${phone}`);
    if (!allowed) {
      track(429);
      return NextResponse.json(
        { error: "Слишком много запросов" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
      );
    }

    const url = new URL(request.url);
    const channel = url.searchParams.get("channel") ?? "";
    const sinceVersion = Number(url.searchParams.get("since") ?? "0");
    const heartbeat = url.searchParams.get("heartbeat") === "1";
    const wait = url.searchParams.get("wait") === "1";
    const waitEnabled = wait && !heartbeat;

    if (!channel) {
      track(400);
      return NextResponse.json({ error: "Укажите channel" }, { status: 400 });
    }

    await assertChannelParticipant(phone, channel);
    await setMessengerPresence(phone, channel);

    if (channel.startsWith("dm:")) {
      let current = await getDmMessagesSince(channel, sinceVersion);
      if (waitEnabled && sinceVersion >= current.meta.version) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < LONG_POLL_MAX_WAIT_MS) {
          await sleep(LONG_POLL_CHECK_INTERVAL_MS);
          current = await getDmMessagesSince(channel, sinceVersion);
          if (current.meta.version > sinceVersion) break;
        }
      }
      const peerPhone = peerFromDmChannel(channel, phone);
      let peerOnline = false;
      let peerTyping = false;
      if (peerPhone) {
        const presence = await getMessengerPresence(peerPhone);
        peerOnline = isMessengerOnline(presence);
        peerTyping = await isMessengerTyping(channel, peerPhone);
      }
      if (sinceVersion >= current.meta.version) {
        track(200);
        return NextResponse.json({
          channel,
          meta: current.meta,
          messages: [],
          envelopes: [],
          peerOnline,
          peerTyping,
        });
      }
      track(200);
      return NextResponse.json({
        channel,
        meta: current.meta,
        messages: current.messages,
        envelopes: current.envelopes,
        peerOnline,
        peerTyping,
      });
    }

    if (channel.startsWith("room:")) {
      const roomId = channel.slice(5);
      await pruneInactiveRoom(roomId);
      if (!(await getRoomMeta(roomId))) {
        track(410);
        return NextResponse.json({ error: "room_gone" }, { status: 410 });
      }
      if (heartbeat) {
        await updateRoomHeartbeat(roomId, phone);
      }
      let current = await getRoomMessagesSince(roomId, sinceVersion);
      if (waitEnabled && sinceVersion >= current.meta.version) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < LONG_POLL_MAX_WAIT_MS) {
          await sleep(LONG_POLL_CHECK_INTERVAL_MS);
          if (!(await getRoomMeta(roomId))) {
            track(410);
            return NextResponse.json({ error: "room_gone" }, { status: 410 });
          }
          current = await getRoomMessagesSince(roomId, sinceVersion);
          if (current.meta.version > sinceVersion) break;
        }
      }
      if (sinceVersion >= current.meta.version && !heartbeat) {
        track(304);
        return new NextResponse(null, { status: 304 });
      }
      if (sinceVersion >= current.meta.version) {
        track(200);
        return NextResponse.json({
          channel,
          meta: current.meta,
          messages: [],
          envelopes: [],
          participants: current.participants,
        });
      }
      track(200);
      return NextResponse.json({
        channel,
        meta: current.meta,
        messages: current.messages,
        envelopes: current.envelopes,
        participants: current.participants,
      });
    }

    track(400);
    return NextResponse.json({ error: "Неизвестный канал" }, { status: 400 });
  } catch (err) {
    const res = jsonAuthError(err);
    void trackMessengerApiRequest("poll", res.status);
    return res;
  }
}
