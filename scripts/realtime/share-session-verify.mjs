import { createHash } from "node:crypto";
import Redis from "ioredis";

const MEMBER_PREFIX = "room-core:share:member:";

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

let redis;

function getRedis() {
  if (!redis) {
    const url = process.env.REDIS_URL?.trim();
    if (!url) return null;
    redis = new Redis(url, { maxRetriesPerRequest: 2 });
  }
  return redis;
}

export async function verifyShareParticipant(participantId, accessToken) {
  const client = getRedis();
  if (!client || !participantId || !accessToken) return null;

  const raw = await client.get(`${MEMBER_PREFIX}${participantId}`);
  if (!raw) return null;

  let member;
  try {
    member = JSON.parse(raw);
  } catch {
    return null;
  }

  if (member.left) return null;
  if (member.tokenHash !== hashToken(accessToken)) return null;

  return {
    participantId: member.memberId,
    roomId: member.roomId,
    displayName: member.displayName,
    role: member.role,
  };
}
