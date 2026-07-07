import { generateMessageId } from "./codes";
import {
  DEFAULT_CALL_TTL_SEC,
  MAX_CALL_SIGNALS,
  REDIS_CALL_DM_ACTIVE_PREFIX,
  REDIS_CALL_INCOMING_PREFIX,
  REDIS_CALL_PREFIX,
} from "./constants";
import { normalizeKzPhone } from "./phone";
import {
  publishCallSignalEvent,
  publishIncomingCallEvent,
} from "./realtime/publish";
import {
  redisDel,
  redisExpire,
  redisGet,
  redisGetJson,
  redisLpush,
  redisLtrim,
  redisLrange,
  redisSet,
  parseRedisJsonValue,
} from "./redis";
import type { CallSession, CallSignal, CallSignalType, CallStatus } from "./types";

function callTtlSec(): number {
  const sec = Number(process.env.MESSENGER_CALL_TTL_SEC ?? DEFAULT_CALL_TTL_SEC);
  return Math.max(60, sec);
}

function callKey(callId: string): string {
  return `${REDIS_CALL_PREFIX}${callId}`;
}

function signalsKey(callId: string): string {
  return `${REDIS_CALL_PREFIX}${callId}:signals`;
}

function incomingKey(calleePhone: string): string {
  return `${REDIS_CALL_INCOMING_PREFIX}${calleePhone}`;
}

async function clearIncomingForCallee(calleePhone: string): Promise<void> {
  await redisDel(incomingKey(calleePhone));
}

function dmActiveKey(channel: string): string {
  return `${REDIS_CALL_DM_ACTIVE_PREFIX}${channel}:active`;
}

async function touchCallKeys(callId: string, channel: string): Promise<void> {
  const ttl = callTtlSec();
  await redisExpire(callKey(callId), ttl);
  await redisExpire(signalsKey(callId), ttl);
  await redisExpire(dmActiveKey(channel), ttl);
}

export async function getCallSession(callId: string): Promise<CallSession | null> {
  return redisGetJson<CallSession>(callKey(callId));
}

export async function getActiveCallForChannel(channel: string): Promise<CallSession | null> {
  const activeId = await redisGet(dmActiveKey(channel));
  if (!activeId) return null;
  const session = await getCallSession(activeId);
  if (!session || session.status === "ended") {
    await redisDel(dmActiveKey(channel));
    return null;
  }
  return session;
}

const STALE_RINGING_MS = 90_000;
const STALE_CONNECTING_MS = 120_000;

function isStaleActiveCall(session: CallSession): boolean {
  const age = Date.now() - session.createdAt;
  if (session.status === "ringing") return age > STALE_RINGING_MS;
  if (session.status === "connecting") return age > STALE_CONNECTING_MS;
  return false;
}

/** End abandoned calls so the channel is not stuck on "busy". */
export async function clearStaleActiveCall(
  channel: string,
  endedBy: string,
): Promise<boolean> {
  const existing = await getActiveCallForChannel(channel);
  if (!existing || !isStaleActiveCall(existing)) return false;
  if (!isParticipant(existing, endedBy)) return false;
  try {
    await endCallSession(existing.callId, endedBy, "timeout");
    return true;
  } catch {
    await redisDel(dmActiveKey(channel));
    return true;
  }
}

function isParticipant(session: CallSession, phone: string): boolean {
  return session.caller === phone || session.callee === phone;
}

export async function createCallSession(params: {
  channel: string;
  caller: string;
  callee: string;
  media?: "audio" | "video";
}): Promise<CallSession> {
  const caller = normalizeKzPhone(params.caller);
  const callee = normalizeKzPhone(params.callee);

  let existing = await getActiveCallForChannel(params.channel);
  if (existing && existing.status !== "ended") {
    if (existing.caller === caller) {
      try {
        await endCallSession(existing.callId, caller, "superseded");
      } catch {
        await redisDel(dmActiveKey(params.channel));
      }
      existing = null;
    } else if (isStaleActiveCall(existing) && isParticipant(existing, caller)) {
      try {
        await endCallSession(existing.callId, caller, "timeout");
      } catch {
        await redisDel(dmActiveKey(params.channel));
      }
      existing = null;
    }
  }
  if (existing && existing.status !== "ended") {
    throw new CallStoreError("busy", 409);
  }

  const callId = generateMessageId();
  const session: CallSession = {
    callId,
    channel: params.channel,
    caller,
    callee,
    media: params.media === "video" ? "video" : "audio",
    status: "ringing",
    version: 1,
    signalSeq: 0,
    createdAt: Date.now(),
  };

  const ttl = callTtlSec();
  await redisSet(callKey(callId), JSON.stringify(session), ttl);
  await redisSet(dmActiveKey(params.channel), callId, ttl);
  await redisSet(
    incomingKey(callee),
    JSON.stringify({ callId, channel: params.channel, caller }),
    ttl,
  );
  void publishIncomingCallEvent({
    callId,
    channel: params.channel,
    callerPhone: caller,
    calleePhone: callee,
    media: session.media ?? "audio",
  }).catch(() => {});
  return session;
}

export async function getIncomingCallForUser(
  phone: string,
): Promise<{ callId: string; channel: string; caller: string } | null> {
  const raw = await redisGet(incomingKey(phone));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { callId: string; channel: string; caller: string };
    const session = await getCallSession(parsed.callId);
    if (!session || session.status === "ended" || session.status !== "ringing") {
      await clearIncomingForCallee(phone);
      return null;
    }
    return parsed;
  } catch {
    await clearIncomingForCallee(phone);
    return null;
  }
}

export class CallStoreError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function updateCallStatus(
  callId: string,
  status: CallStatus,
  endReason?: string,
): Promise<CallSession | null> {
  const session = await getCallSession(callId);
  if (!session) return null;

  session.status = status;
  session.version += 1;
  if (status === "ended") {
    session.endedAt = Date.now();
    session.endReason = endReason;
    await redisDel(dmActiveKey(session.channel));
    await clearIncomingForCallee(session.callee);
  }

  const ttl = callTtlSec();
  await redisSet(callKey(callId), JSON.stringify(session), ttl);
  if (status !== "ended") {
    await touchCallKeys(callId, session.channel);
  }
  return session;
}

export async function appendCallSignal(params: {
  callId: string;
  from: string;
  type: CallSignalType;
  payload?: string;
}): Promise<{ session: CallSession; signal: CallSignal } | null> {
  const session = await getCallSession(params.callId);
  if (!session) return null;
  if (!isParticipant(session, params.from)) {
    throw new CallStoreError("forbidden", 403);
  }
  if (session.status === "ended") {
    throw new CallStoreError("call_ended", 410);
  }

  const signal: CallSignal = {
    id: generateMessageId(),
    type: params.type,
    from: params.from,
    ts: Date.now(),
    seq: session.signalSeq + 1,
    payload: params.payload,
  };

  session.signalSeq = signal.seq;
  session.version += 1;

  if (params.type === "reject" || params.type === "busy") {
    session.status = "ended";
    session.endedAt = Date.now();
    session.endReason = params.type;
    await redisDel(dmActiveKey(session.channel));
    await clearIncomingForCallee(session.callee);
  } else if (params.type === "end") {
    session.status = "ended";
    session.endedAt = Date.now();
    session.endReason = "end";
    await redisDel(dmActiveKey(session.channel));
    await clearIncomingForCallee(session.callee);
  } else if (params.type === "answer") {
    session.answerSdp = params.payload;
    session.status = "connecting";
    await clearIncomingForCallee(session.callee);
  } else if (params.type === "offer") {
    session.offerSdp = params.payload;
    // offer stays ringing until answer
  }

  const ttl = callTtlSec();
  await redisSet(callKey(params.callId), JSON.stringify(session), ttl);
  await redisLpush(signalsKey(params.callId), JSON.stringify(signal));
  await redisLtrim(signalsKey(params.callId), 0, Math.max(0, MAX_CALL_SIGNALS - 1));
  await redisExpire(signalsKey(params.callId), ttl);

  if (session.status !== "ended") {
    await touchCallKeys(params.callId, session.channel);
  }

  void publishCallSignalEvent({ session, signals: [signal] }).catch(() => {});

  return { session, signal };
}

export async function getCallSignalsSince(
  callId: string,
  sinceSeq: number,
): Promise<CallSignal[]> {
  const raw = await redisLrange(signalsKey(callId), 0, MAX_CALL_SIGNALS - 1);
  const signals: CallSignal[] = [];
  for (const item of raw) {
    const parsed = parseRedisJsonValue<CallSignal>(item);
    if (!parsed || typeof parsed.seq !== "number") continue;
    if (parsed.seq > sinceSeq) signals.push(parsed);
  }
  signals.sort((a, b) => a.seq - b.seq);
  return signals;
}

export async function refreshCallHeartbeat(callId: string, phone: string): Promise<boolean> {
  const session = await getCallSession(callId);
  if (!session || session.status === "ended") return false;
  if (!isParticipant(session, phone)) return false;
  await touchCallKeys(callId, session.channel);
  return true;
}

export async function endCallSession(
  callId: string,
  phone: string,
  reason = "end",
): Promise<CallSession | null> {
  const session = await getCallSession(callId);
  if (!session) return null;
  if (!isParticipant(session, phone)) {
    throw new CallStoreError("forbidden", 403);
  }
  if (session.status === "ended") return session;

  const result = await appendCallSignal({ callId, from: phone, type: "end" });
  if (!result) return null;

  const ttl = callTtlSec();
  result.session.endReason = reason;
  await redisSet(callKey(callId), JSON.stringify(result.session), ttl);
  await clearIncomingForCallee(result.session.callee);
  return result.session;
}
