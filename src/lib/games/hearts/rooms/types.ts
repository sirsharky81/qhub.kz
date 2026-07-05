import type { HeartsAction, HeartsAiLevel, HeartsState } from "../types";

export interface HeartsRoomSeat {
  id: string;
  name: string;
  isBot: boolean;
  aiLevel: HeartsAiLevel;
  joinToken: string | null;
  connected: boolean;
  controlledByAi: boolean;
}

export interface HeartsRoomRecord {
  roomCode: string;
  hostSecret: string;
  status: "open" | "playing" | "finished";
  seats: HeartsRoomSeat[];
  state: HeartsState;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface HeartsRoomPublic {
  roomCode: string;
  status: HeartsRoomRecord["status"];
  seats: Omit<HeartsRoomSeat, "joinToken">[];
  state: HeartsState;
  version: number;
  updatedAt: number;
}

export interface HeartsRoomJoinResult {
  roomCode: string;
  playerId: string;
  joinToken: string;
  hostSecret?: string;
  room: HeartsRoomPublic;
}

export interface HeartsDispatchPayload {
  playerId: string;
  joinToken: string;
  action: HeartsAction;
}
