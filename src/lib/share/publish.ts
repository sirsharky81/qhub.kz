import { redisPublish } from "@/lib/redis/commands";
import { createShareRoomEngine } from "@/lib/room-core";
import type { SharePollResponse, ShareSignal } from "./types";

const eng = () => createShareRoomEngine();

export async function publishShareSignal(roomId: string, signal: ShareSignal): Promise<void> {
  const payload = JSON.stringify({ type: "share_signal", roomId, signal });
  await redisPublish(eng().roomChannel(roomId), payload);

  const room = await eng().getRoom(roomId);
  if (!room) return;
  for (const memberId of room.memberIds) {
    await redisPublish(eng().participantChannel(memberId), payload);
  }
}

export async function publishShareSnapshot(
  participantId: string,
  snapshot: SharePollResponse,
): Promise<void> {
  const payload = JSON.stringify({ type: "share_snapshot", participantId, snapshot });
  await redisPublish(eng().participantChannel(participantId), payload);
}
