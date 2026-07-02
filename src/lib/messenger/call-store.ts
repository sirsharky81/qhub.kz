import { generateMessageId } from "./codes";
import {
  DEFAULT_CALL_TTL_SEC,
  MAX_CALL_SIGNALS,
  REDIS_CALL_DM_ACTIVE_PREFIX,
  REDIS_CALL_PREFIX,
} from "./constants";
import {
  redisDel,
  redisExpire,
  redisGet,
  redisGetJson,
  redisLpush,
  redisLrange,
  redisSet,
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

function isParticipant(session: CallSession, phone: string): boolean {
  return session.caller === phone || session.callee === phone;
}

export async function createCallSession(params: {
  channel: string;
  caller: string;
  callee: string;
}): Promise<CallSession> {
  const existing = await getActiveCallForChannel(params.channel);
  if (existing && existing.status !== "ended") {
    throw new CallStoreError("busy", 409);
  }

  const callId = generateMessageId();
  const session: CallSession = {
    callId,
    channel: params.channel,
    caller: params.caller,
    callee: params.callee,
    status: "ringing",
    version: 1,
    signalSeq: 0,
    createdAt: Date.now(),
  };

  const ttl = callTtlSec();
  await redisSet(callKey(callId), JSON.stringify(session), ttl);
  await redisSet(dmActiveKey(params.channel), callId, ttl);
  return session;
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
  } else if (params.type === "end") {
    session.status = "ended";
    session.endedAt = Date.now();
    session.endReason = "end";
    await redisDel(dmActiveKey(session.channel));
  } else if (params.type === "answer") {
    session.status = "connecting";
  } else if (params.type === "offer" && session.status === "ringing") {
    // offer stays ringing until answer
  }

  const ttl = callTtlSec();
  await redisSet(callKey(params.callId), JSON.stringify(session), ttl);
  await redisLpush(signalsKey(params.callId), JSON.stringify(signal));
  await redisExpire(signalsKey(params.callId), ttl);

  if (session.status !== "ended") {
    await touchCallKeys(params.callId, session.channel);
  }

  return { session, signal };
}

export async function getCallSignalsSince(
  callId: string,
  sinceSeq: number,
): Promise<CallSignal[]> {
  const raw = await redisLrange(signalsKey(callId), 0, MAX_CALL_SIGNALS - 1);
  const signals: CallSignal[] = [];
  for (const item of raw) {
    const parsed = JSON.parse(item) as CallSignal;
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
  return result.session;
}
