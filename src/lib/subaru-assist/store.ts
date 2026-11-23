import { SUBARU_ASSIST_ROOM_CONFIG } from "@/lib/room-core/config";
import { createRoomCoreRedis } from "@/lib/room-core/redis";
import {
  ASSIST_STATUS_CODES,
  isAssistService,
  isAssistStatusCode,
  type AssistService,
  type AssistStatusCode,
} from "./status";

export interface AssistSignal {
  seq: number;
  fromMemberId: string;
  type: "offer" | "answer" | "ice";
  payload: string;
}

export interface AssistStatusEvent {
  code: AssistStatusCode;
  at: number;
}

export interface AssistRoomState {
  service: AssistService | null;
  ignition: boolean;
  adapter: "offline" | "online";
  regionWriteOk: boolean;
  statuses: AssistStatusEvent[];
  signals: AssistSignal[];
  signalSeq: number;
}

const redis = createRoomCoreRedis(SUBARU_ASSIST_ROOM_CONFIG.redisPrefix);
const TTL = SUBARU_ASSIST_ROOM_CONFIG.ttlSec;

function stateKey(roomId: string): string {
  return `${SUBARU_ASSIST_ROOM_CONFIG.redisPrefix}state:${roomId}`;
}

export function emptyAssistState(): AssistRoomState {
  return {
    service: null,
    ignition: false,
    adapter: "offline",
    regionWriteOk: false,
    statuses: [],
    signals: [],
    signalSeq: 0,
  };
}

export async function getAssistState(roomId: string): Promise<AssistRoomState> {
  return (await redis.getJson<AssistRoomState>(stateKey(roomId))) ?? emptyAssistState();
}

async function saveAssistState(roomId: string, state: AssistRoomState): Promise<void> {
  await redis.set(stateKey(roomId), JSON.stringify(state), TTL);
}

export async function patchAssistClientState(
  roomId: string,
  patch: { service?: AssistService; ignition?: boolean; adapter?: "offline" | "online" },
): Promise<AssistRoomState> {
  const state = await getAssistState(roomId);
  if (patch.service && isAssistService(patch.service)) state.service = patch.service;
  if (typeof patch.ignition === "boolean") state.ignition = patch.ignition;
  if (patch.adapter === "online" || patch.adapter === "offline") state.adapter = patch.adapter;
  await saveAssistState(roomId, state);
  return state;
}

export async function markAssistRegionWriteOk(roomId: string): Promise<AssistRoomState> {
  const state = await getAssistState(roomId);
  state.regionWriteOk = true;
  await saveAssistState(roomId, state);
  return state;
}

export async function pushAssistStatus(roomId: string, code: string): Promise<AssistRoomState> {
  if (!isAssistStatusCode(code)) throw new Error("bad_status");
  const state = await getAssistState(roomId);
  state.statuses = [...state.statuses, { code, at: Date.now() }].slice(-40);
  await saveAssistState(roomId, state);
  return state;
}

export async function clearAssistState(roomId: string): Promise<void> {
  await redis.del(stateKey(roomId));
}

export async function appendAssistSignal(
  roomId: string,
  fromMemberId: string,
  type: AssistSignal["type"],
  payload: string,
): Promise<AssistSignal> {
  const state = await getAssistState(roomId);
  state.signalSeq += 1;
  const signal: AssistSignal = {
    seq: state.signalSeq,
    fromMemberId,
    type,
    payload: payload.slice(0, 32_000),
  };
  state.signals = [...state.signals, signal].slice(-60);
  await saveAssistState(roomId, state);
  return signal;
}

export function assistSignalsSince(state: AssistRoomState, since: number): AssistSignal[] {
  return state.signals.filter((signal) => signal.seq > since);
}

export const ASSIST_STATUS_CODE_SET = new Set<string>(ASSIST_STATUS_CODES);
